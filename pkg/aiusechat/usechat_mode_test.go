// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"testing"

	"github.com/wavetermdev/waveterm/pkg/aiusechat/uctypes"
	"github.com/wavetermdev/waveterm/pkg/wconfig"
)

func TestApplyProviderDefaultsGroq(t *testing.T) {
	config := wconfig.AIModeConfigType{
		Provider: uctypes.AIProvider_Groq,
	}
	applyProviderDefaults(&config)
	if config.APIType != uctypes.APIType_OpenAIChat {
		t.Fatalf("expected API type %q, got %q", uctypes.APIType_OpenAIChat, config.APIType)
	}
	if config.Endpoint != GroqChatEndpoint {
		t.Fatalf("expected endpoint %q, got %q", GroqChatEndpoint, config.Endpoint)
	}
	if config.APITokenSecretName != GroqAPITokenSecretName {
		t.Fatalf("expected API token secret name %q, got %q", GroqAPITokenSecretName, config.APITokenSecretName)
	}
}

func TestApplyProviderDefaultsKeepsProxyURL(t *testing.T) {
	config := wconfig.AIModeConfigType{
		Provider: uctypes.AIProvider_OpenAI,
		Model:    "gpt-5-mini",
		ProxyURL: "http://localhost:8080",
	}
	applyProviderDefaults(&config)
	if config.ProxyURL != "http://localhost:8080" {
		t.Fatalf("expected proxy URL to be preserved, got %q", config.ProxyURL)
	}
}

func TestApplyProviderDefaultsAnthropic(t *testing.T) {
	config := wconfig.AIModeConfigType{Provider: uctypes.AIProvider_Anthropic, Model: "claude-sonnet-4-5"}
	applyProviderDefaults(&config)
	if config.APIType != uctypes.APIType_AnthropicMessages {
		t.Fatalf("expected API type %q, got %q", uctypes.APIType_AnthropicMessages, config.APIType)
	}
	if config.Endpoint != AnthropicMessagesEndpoint {
		t.Fatalf("unexpected endpoint %q", config.Endpoint)
	}
	if config.APITokenSecretName != AnthropicAPITokenSecretName {
		t.Fatalf("unexpected secret name %q", config.APITokenSecretName)
	}
	if len(config.Capabilities) == 0 {
		t.Fatal("expected default capabilities")
	}
}
