// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/wavetermdev/waveterm/pkg/aiusechat/aiutil"
	"github.com/wavetermdev/waveterm/pkg/aiusechat/anthropic"
	"github.com/wavetermdev/waveterm/pkg/aiusechat/uctypes"
	"github.com/wavetermdev/waveterm/pkg/secretstore"
)

const (
	ModelListProviderLMStudio = "lmstudio"
	ModelListProviderOpenAI   = uctypes.AIProvider_OpenAI
	ModelListProviderClaude   = uctypes.AIProvider_Anthropic

	LMStudioDefaultBaseURL = "http://localhost:1234/v1"
	OpenAIDefaultBaseURL   = "https://api.openai.com/v1"
	AnthropicDefaultBase   = "https://api.anthropic.com/v1"

	ModelListTimeout  = 10 * time.Second
	ModelListMaxBytes = 2 << 20
)

type ListModelsParams struct {
	Provider   string
	Endpoint   string
	APIToken   string
	SecretName string
}

type modelListResponse struct {
	Data []struct {
		Id string `json:"id"`
	} `json:"data"`
}

func resolveModelListToken(params ListModelsParams, defaultSecretName string) (string, error) {
	token := strings.TrimSpace(params.APIToken)
	if token != "" {
		return token, nil
	}
	secretName := params.SecretName
	if secretName == "" {
		secretName = defaultSecretName
	}
	if secretName == "" {
		return "", nil
	}
	secret, exists, err := secretstore.GetSecret(secretName)
	if err != nil {
		return "", fmt.Errorf("could not read the saved API key: %w", err)
	}
	if !exists {
		return "", nil
	}
	return strings.TrimSpace(secret), nil
}

func modelListHTTPError(provider string, status int) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("%s rejected the API key (HTTP %d)", provider, status)
	case http.StatusNotFound:
		return fmt.Errorf("%s has no model list at this address (HTTP 404)", provider)
	}
	return fmt.Errorf("%s returned HTTP %d", provider, status)
}

// ListProviderModels contacts the provider only when the user asks for it from the settings page.
func ListProviderModels(ctx context.Context, params ListModelsParams) ([]string, error) {
	var base, label, defaultSecret string
	switch params.Provider {
	case ModelListProviderLMStudio:
		base, label = LMStudioDefaultBaseURL, "LM Studio"
	case ModelListProviderOpenAI:
		base, label, defaultSecret = OpenAIDefaultBaseURL, "OpenAI", OpenAIAPITokenSecretName
	case ModelListProviderClaude:
		base, label, defaultSecret = AnthropicDefaultBase, "Anthropic", AnthropicAPITokenSecretName
	default:
		return nil, fmt.Errorf("unsupported provider %q", params.Provider)
	}
	if strings.TrimSpace(params.Endpoint) != "" {
		base = strings.TrimSpace(params.Endpoint)
	}
	parsed, err := url.Parse(base)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, fmt.Errorf("%q is not a valid http or https address", base)
	}
	token, err := resolveModelListToken(params, defaultSecret)
	if err != nil {
		return nil, err
	}
	if token == "" && params.Provider != ModelListProviderLMStudio {
		return nil, fmt.Errorf("enter an API key for %s first", label)
	}

	ctx, cancel := context.WithTimeout(ctx, ModelListTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(base, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/json")
	if params.Provider == ModelListProviderClaude {
		req.Header.Set("x-api-key", token)
		req.Header.Set("anthropic-version", anthropic.AnthropicDefaultAPIVersion)
	} else if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client, err := aiutil.MakeHTTPClient("")
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach %s: %w", label, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, modelListHTTPError(label, resp.StatusCode)
	}
	var list modelListResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, ModelListMaxBytes)).Decode(&list); err != nil {
		return nil, fmt.Errorf("%s sent a model list that could not be read: %w", label, err)
	}
	seen := make(map[string]bool)
	models := make([]string, 0, len(list.Data))
	for _, item := range list.Data {
		if item.Id == "" || seen[item.Id] {
			continue
		}
		seen[item.Id] = true
		models = append(models, item.Id)
	}
	sort.Strings(models)
	return models, nil
}
