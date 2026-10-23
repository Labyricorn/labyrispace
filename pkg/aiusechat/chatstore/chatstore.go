// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatstore

import (
	"fmt"
	"log"
	"slices"
	"strings"
	"sync"

	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
)

const MaxChatTitleLen = 80

type ChatStore struct {
	lock      sync.Mutex
	chats     map[string]*uctypes.AIChat
	persister Persister
}

var DefaultChatStore = MakeChatStore()

func MakeChatStore() *ChatStore {
	return &ChatStore{chats: make(map[string]*uctypes.AIChat)}
}

func (cs *ChatStore) SetPersister(persister Persister) {
	cs.lock.Lock()
	defer cs.lock.Unlock()
	cs.persister = persister
}

// getOrLoadChatLocked returns the in-memory chat, loading it from the persister on a cache miss.
// The caller must hold cs.lock.
func (cs *ChatStore) getOrLoadChatLocked(chatId string) *uctypes.AIChat {
	if chat := cs.chats[chatId]; chat != nil {
		return chat
	}
	if cs.persister == nil {
		return nil
	}
	chat, err := cs.persister.LoadChat(chatId)
	if err != nil {
		log.Printf("chatstore: error loading chat %s: %v\n", chatId, err)
		return nil
	}
	if chat == nil {
		return nil
	}
	cs.chats[chatId] = chat
	return chat
}

func (cs *ChatStore) Get(chatId string) *uctypes.AIChat {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.getOrLoadChatLocked(chatId)
	if chat == nil {
		return nil
	}

	// Copy the chat to prevent concurrent access issues
	copyChat := &uctypes.AIChat{
		ChatId:         chat.ChatId,
		APIType:        chat.APIType,
		Model:          chat.Model,
		APIVersion:     chat.APIVersion,
		NativeMessages: make([]uctypes.GenAIMessage, len(chat.NativeMessages)),
	}
	copy(copyChat.NativeMessages, chat.NativeMessages)

	return copyChat
}

func (cs *ChatStore) Delete(chatId string) {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	delete(cs.chats, chatId)
	if cs.persister == nil {
		return
	}
	if err := cs.persister.DeleteChat(chatId); err != nil {
		log.Printf("chatstore: error deleting chat %s: %v\n", chatId, err)
	}
}

func (cs *ChatStore) CountUserMessages(chatId string) int {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.getOrLoadChatLocked(chatId)
	if chat == nil {
		return 0
	}

	count := 0
	for _, msg := range chat.NativeMessages {
		if msg.GetRole() == "user" {
			count++
		}
	}
	return count
}

func (cs *ChatStore) PostMessage(chatId string, aiOpts *uctypes.AIOptsType, message uctypes.GenAIMessage) error {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.getOrLoadChatLocked(chatId)
	if chat == nil {
		// Create new chat
		chat = &uctypes.AIChat{
			ChatId:         chatId,
			APIType:        aiOpts.APIType,
			Model:          aiOpts.Model,
			APIVersion:     aiOpts.APIVersion,
			NativeMessages: make([]uctypes.GenAIMessage, 0),
		}
		cs.chats[chatId] = chat
	} else {
		// Verify that the AI options match
		if chat.APIType != aiOpts.APIType {
			return fmt.Errorf("API type mismatch: expected %s, got %s (must start a new chat)", chat.APIType, aiOpts.APIType)
		}
		if !uctypes.AreModelsCompatible(chat.APIType, chat.Model, aiOpts.Model) {
			return fmt.Errorf("model mismatch: expected %s, got %s (must start a new chat)", chat.Model, aiOpts.Model)
		}
		if chat.APIVersion != aiOpts.APIVersion {
			return fmt.Errorf("API version mismatch: expected %s, got %s (must start a new chat)", chat.APIVersion, aiOpts.APIVersion)
		}
	}

	// Check for existing message with same ID (idempotency)
	messageId := message.GetMessageId()
	seq := len(chat.NativeMessages)
	for i, existingMessage := range chat.NativeMessages {
		if existingMessage.GetMessageId() == messageId {
			// Replace existing message with same ID
			chat.NativeMessages[i] = message
			seq = i
			cs.persistMessageLocked(chat, aiOpts.AIMode, seq, message)
			return nil
		}
	}

	// Append the new message if no duplicate found
	chat.NativeMessages = append(chat.NativeMessages, message)
	cs.persistMessageLocked(chat, aiOpts.AIMode, seq, message)

	return nil
}

func (cs *ChatStore) persistMessageLocked(chat *uctypes.AIChat, aiMode string, seq int, message uctypes.GenAIMessage) {
	if cs.persister == nil {
		return
	}
	if err := cs.persister.UpsertMessage(chat, aiMode, seq, message); err != nil {
		log.Printf("chatstore: error persisting message %s in chat %s: %v\n", message.GetMessageId(), chat.ChatId, err)
	}
}

func (cs *ChatStore) RemoveMessage(chatId string, messageId string) bool {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.getOrLoadChatLocked(chatId)
	if chat == nil {
		return false
	}

	initialLen := len(chat.NativeMessages)
	chat.NativeMessages = slices.DeleteFunc(chat.NativeMessages, func(msg uctypes.GenAIMessage) bool {
		return msg.GetMessageId() == messageId
	})
	removed := len(chat.NativeMessages) < initialLen
	if removed && cs.persister != nil {
		if err := cs.persister.DeleteMessage(chatId, messageId); err != nil {
			log.Printf("chatstore: error deleting message %s in chat %s: %v\n", messageId, chatId, err)
		}
	}
	return removed
}

// SetTitleIfEmpty names a chat from the first line of its opening user message.
func (cs *ChatStore) SetTitleIfEmpty(chatId string, text string) {
	title := MakeChatTitle(text)
	if title == "" {
		return
	}
	cs.lock.Lock()
	defer cs.lock.Unlock()
	if cs.persister == nil {
		return
	}
	if err := cs.persister.SetTitleIfEmpty(chatId, title); err != nil {
		log.Printf("chatstore: error setting title for chat %s: %v\n", chatId, err)
	}
}

func (cs *ChatStore) ListChats(limit int) ([]uctypes.AIChatSummary, error) {
	cs.lock.Lock()
	defer cs.lock.Unlock()
	if cs.persister == nil {
		return []uctypes.AIChatSummary{}, nil
	}
	return cs.persister.ListChats(limit)
}

func MakeChatTitle(text string) string {
	title := strings.Join(strings.Fields(text), " ")
	runes := []rune(title)
	if len(runes) > MaxChatTitleLen {
		return string(runes[:MaxChatTitleLen-1]) + "…"
	}
	return title
}
