// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func newModelServer(t *testing.T, check func(r *http.Request)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		check(r)
		w.Write([]byte(`{"data":[{"id":"b-model"},{"id":"a-model"},{"id":"b-model"},{"id":""}]}`))
	}))
}

func TestListProviderModelsLMStudioNeedsNoKey(t *testing.T) {
	srv := newModelServer(t, func(r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Errorf("unexpected auth header for keyless LM Studio")
		}
	})
	defer srv.Close()
	models, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "lmstudio", Endpoint: srv.URL + "/v1"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(models, []string{"a-model", "b-model"}) {
		t.Fatalf("unexpected models %v", models)
	}
}

func TestListProviderModelsOpenAISendsBearer(t *testing.T) {
	srv := newModelServer(t, func(r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("bad auth header %q", r.Header.Get("Authorization"))
		}
	})
	defer srv.Close()
	_, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "openai", Endpoint: srv.URL + "/v1", APIToken: " sk-test "})
	if err != nil {
		t.Fatal(err)
	}
}

func TestListProviderModelsAnthropicHeaders(t *testing.T) {
	srv := newModelServer(t, func(r *http.Request) {
		if r.Header.Get("x-api-key") != "ak-test" || r.Header.Get("anthropic-version") == "" {
			t.Errorf("bad anthropic headers %v", r.Header)
		}
	})
	defer srv.Close()
	_, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "anthropic", Endpoint: srv.URL + "/v1", APIToken: "ak-test"})
	if err != nil {
		t.Fatal(err)
	}
}

func TestListProviderModelsErrors(t *testing.T) {
	denied := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer denied.Close()
	_, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "openai", Endpoint: denied.URL, APIToken: "bad"})
	if err == nil || !strings.Contains(err.Error(), "rejected the API key") {
		t.Fatalf("expected key rejection, got %v", err)
	}
	if _, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "bogus"}); err == nil {
		t.Fatal("expected unsupported provider error")
	}
	if _, err := ListProviderModels(context.Background(), ListModelsParams{Provider: "lmstudio", Endpoint: "ftp://x"}); err == nil {
		t.Fatal("expected invalid address error")
	}
}
