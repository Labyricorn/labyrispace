// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package gemini

import (
	"encoding/json"

	"github.com/Labyricorn/labyrispace/pkg/aiusechat/chatstore"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
)

func init() {
	chatstore.RegisterMessageDecoder(uctypes.APIType_GoogleGemini, func(raw []byte) (uctypes.GenAIMessage, error) {
		var msg GeminiChatMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil
	})
}
