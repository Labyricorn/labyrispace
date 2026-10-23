// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatdb

import (
	"encoding/json"
	"testing"

	"github.com/Labyricorn/labyrispace/pkg/aiusechat/anthropic"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/chatstore"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/gemini"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/openai"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/openaichat"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
)

type backendCase struct {
	apiType string
	model   string
	convert func(uctypes.AIMessage) (uctypes.GenAIMessage, error)
}

func backendCases() []backendCase {
	return []backendCase{
		{uctypes.APIType_OpenAIResponses, "gpt-5-mini", func(m uctypes.AIMessage) (uctypes.GenAIMessage, error) {
			return openai.ConvertAIMessageToOpenAIChatMessage(m)
		}},
		{uctypes.APIType_OpenAIChat, "hermes-agent", func(m uctypes.AIMessage) (uctypes.GenAIMessage, error) {
			return openaichat.ConvertAIMessageToStoredChatMessage(m)
		}},
		{uctypes.APIType_AnthropicMessages, "claude-sonnet-4-5", func(m uctypes.AIMessage) (uctypes.GenAIMessage, error) {
			return anthropic.ConvertAIMessageToAnthropicChatMessage(m)
		}},
		{uctypes.APIType_GoogleGemini, "gemini-2.5-flash", func(m uctypes.AIMessage) (uctypes.GenAIMessage, error) {
			return gemini.ConvertAIMessageToGeminiChatMessage(m)
		}},
	}
}

func makeTestStore(t *testing.T) (*chatstore.ChatStore, *ChatDB) {
	t.Helper()
	chatDB, err := MakeChatDB("")
	if err != nil {
		t.Fatalf("MakeChatDB: %v", err)
	}
	store := chatstore.MakeChatStore()
	store.SetPersister(chatDB)
	return store, chatDB
}

func TestMessagesSurviveRestart(t *testing.T) {
	for _, tc := range backendCases() {
		t.Run(tc.apiType, func(t *testing.T) {
			store, chatDB := makeTestStore(t)
			opts := &uctypes.AIOptsType{APIType: tc.apiType, Model: tc.model, AIMode: "custom@test"}
			var posted []uctypes.GenAIMessage
			for _, id := range []string{"m1", "m2"} {
				msg, err := tc.convert(uctypes.AIMessage{
					MessageId: id,
					Parts:     []uctypes.AIMessagePart{{Type: uctypes.AIMessagePartTypeText, Text: "hello " + id}},
				})
				if err != nil {
					t.Fatalf("convert: %v", err)
				}
				if err := store.PostMessage("chat1", opts, msg); err != nil {
					t.Fatalf("PostMessage: %v", err)
				}
				posted = append(posted, msg)
			}

			// A second store on the same database stands in for a restarted process.
			restarted := chatstore.MakeChatStore()
			restarted.SetPersister(chatDB)
			chat := restarted.Get("chat1")
			if chat == nil {
				t.Fatal("chat not loaded from database")
			}
			if chat.APIType != tc.apiType || chat.Model != tc.model {
				t.Fatalf("chat metadata mismatch: %+v", chat)
			}
			if len(chat.NativeMessages) != len(posted) {
				t.Fatalf("got %d messages, want %d", len(chat.NativeMessages), len(posted))
			}
			for i, want := range posted {
				wantJSON, _ := json.Marshal(want)
				gotJSON, _ := json.Marshal(chat.NativeMessages[i])
				if string(wantJSON) != string(gotJSON) {
					t.Fatalf("message %d changed across restart:\nwant %s\ngot  %s", i, wantJSON, gotJSON)
				}
			}
		})
	}
}

func TestReplaceRemoveTitleListDelete(t *testing.T) {
	tc := backendCases()[1]
	store, chatDB := makeTestStore(t)
	opts := &uctypes.AIOptsType{APIType: tc.apiType, Model: tc.model, AIMode: "custom@hermes"}
	post := func(id, text string) {
		msg, err := tc.convert(uctypes.AIMessage{MessageId: id, Parts: []uctypes.AIMessagePart{{Type: uctypes.AIMessagePartTypeText, Text: text}}})
		if err != nil {
			t.Fatal(err)
		}
		if err := store.PostMessage("chat1", opts, msg); err != nil {
			t.Fatal(err)
		}
	}
	post("m1", "first")
	post("m2", "second")
	post("m1", "first edited")
	store.SetTitleIfEmpty("chat1", "  What is\n the   plan? ")
	store.SetTitleIfEmpty("chat1", "ignored second title")

	chat := chatstore.MakeChatStore().Get("chat1")
	if chat != nil {
		t.Fatal("store without persister must not see the chat")
	}

	list, err := store.ListChats(10)
	if err != nil || len(list) != 1 {
		t.Fatalf("ListChats = %v, %v", list, err)
	}
	if list[0].Title != "What is the plan?" || list[0].MessageCount != 2 || list[0].AIMode != "custom@hermes" {
		t.Fatalf("unexpected summary: %+v", list[0])
	}

	if !store.RemoveMessage("chat1", "m2") {
		t.Fatal("RemoveMessage returned false")
	}
	loaded, err := chatDB.LoadChat("chat1")
	if err != nil || loaded == nil || len(loaded.NativeMessages) != 1 {
		t.Fatalf("LoadChat after remove = %+v, %v", loaded, err)
	}

	store.Delete("chat1")
	if got, err := chatDB.LoadChat("chat1"); err != nil || got != nil {
		t.Fatalf("chat still present after delete: %+v, %v", got, err)
	}
	if list, _ := store.ListChats(10); len(list) != 0 {
		t.Fatalf("list not empty after delete: %v", list)
	}
}

func TestModelMismatchStillRejected(t *testing.T) {
	tc := backendCases()[0]
	store, chatDB := makeTestStore(t)
	msg, _ := tc.convert(uctypes.AIMessage{MessageId: "m1", Parts: []uctypes.AIMessagePart{{Type: uctypes.AIMessagePartTypeText, Text: "hi"}}})
	if err := store.PostMessage("chat1", &uctypes.AIOptsType{APIType: tc.apiType, Model: tc.model}, msg); err != nil {
		t.Fatal(err)
	}
	restarted := chatstore.MakeChatStore()
	restarted.SetPersister(chatDB)
	err := restarted.PostMessage("chat1", &uctypes.AIOptsType{APIType: uctypes.APIType_OpenAIChat, Model: "other"}, msg)
	if err == nil {
		t.Fatal("expected API type mismatch for a reloaded chat")
	}
}
