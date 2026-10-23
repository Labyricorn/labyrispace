// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatstore

import (
	"fmt"
	"sync"

	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
)

// Persister is the durable backing for ChatStore. A nil persister keeps chats in memory only.
type Persister interface {
	UpsertMessage(chat *uctypes.AIChat, aiMode string, seq int, msg uctypes.GenAIMessage) error
	DeleteMessage(chatId string, messageId string) error
	DeleteChat(chatId string) error
	LoadChat(chatId string) (*uctypes.AIChat, error)
	SetTitleIfEmpty(chatId string, title string) error
	ListChats(limit int) ([]uctypes.AIChatSummary, error)
}

type MessageDecoder func(raw []byte) (uctypes.GenAIMessage, error)

var (
	decoderLock sync.Mutex
	decoders    = make(map[string]MessageDecoder)
)

func RegisterMessageDecoder(apiType string, decoder MessageDecoder) {
	decoderLock.Lock()
	defer decoderLock.Unlock()
	decoders[apiType] = decoder
}

func getDecoder(apiType string) MessageDecoder {
	decoderLock.Lock()
	defer decoderLock.Unlock()
	return decoders[apiType]
}

func DecodeMessage(apiType string, raw []byte) (uctypes.GenAIMessage, error) {
	decoder := getDecoder(apiType)
	if decoder == nil {
		return nil, fmt.Errorf("no message decoder registered for api type %q", apiType)
	}
	return decoder(raw)
}
