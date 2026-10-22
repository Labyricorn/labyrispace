// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/authkey"
)

func setTestAuthKey(t *testing.T) string {
	t.Helper()
	key := "test-auth-key-for-origin-tests"
	t.Setenv(authkey.WaveAuthKeyEnv, key)
	if err := authkey.SetAuthKeyFromEnv(); err != nil {
		t.Fatalf("failed to set auth key: %v", err)
	}
	return key
}

func TestIsAllowedOrigin(t *testing.T) {
	allowed := []string{"http://localhost:5173", "file://"}
	cases := []struct {
		origin string
		want   bool
	}{
		{"", true},
		{"  ", true},
		{"http://localhost:5173", true},
		{"HTTP://LOCALHOST:5173", true},
		{"file://", true},
		{"null", false},
		{"http://example.com", false},
		{"http://localhost:5174", false},
		{"http://localhost:5173.evil.example", false},
		{"https://localhost:5173", false},
	}
	for _, c := range cases {
		if got := IsAllowedOrigin(c.origin, allowed); got != c.want {
			t.Errorf("origin %q: got %v, want %v", c.origin, got, c.want)
		}
	}
}

func TestIsAllowedOriginWithNoAllowList(t *testing.T) {
	if IsAllowedOrigin("http://localhost:5173", nil) {
		t.Error("a present origin must be rejected when nothing is allowed")
	}
	if !IsAllowedOrigin("", nil) {
		t.Error("a missing origin is left to the auth key check")
	}
}

func TestWebFnWrapRejectsForeignOrigin(t *testing.T) {
	key := setTestAuthKey(t)
	called := false
	handler := WebFnWrap(WebFnOpts{}, func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/wave/file", nil)
	req.Header.Set("X-AuthKey", key)
	req.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("foreign origin: got status %d, want %d", rec.Code, http.StatusForbidden)
	}
	if called {
		t.Error("foreign origin: handler must not run")
	}

	req = httptest.NewRequest(http.MethodGet, "/wave/file", nil)
	req.Header.Set("X-AuthKey", key)
	req.Header.Set("Origin", "null")
	rec = httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("app origin: got status %d, want %d", rec.Code, http.StatusOK)
	}
	if !called {
		t.Error("app origin: handler must run")
	}
}

func TestServiceRouteRequiresJSONContentType(t *testing.T) {
	key := setTestAuthKey(t)
	handler := WebFnWrap(WebFnOpts{JsonErrors: true}, handleService)

	req := httptest.NewRequest(http.MethodPost, "/wave/service", strings.NewReader(`{"service":"x","method":"y"}`))
	req.Header.Set("X-AuthKey", key)
	rec := httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("missing content-type: got status %d, want %d", rec.Code, http.StatusUnsupportedMediaType)
	}

	req = httptest.NewRequest(http.MethodPost, "/wave/service", strings.NewReader("service=x&method=y"))
	req.Header.Set("X-AuthKey", key)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec = httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("form content-type: got status %d, want %d", rec.Code, http.StatusUnsupportedMediaType)
	}
}

func TestWebSocketUpgraderRejectsForeignOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "http://evil.example")
	if WebSocketUpgrader.CheckOrigin(req) {
		t.Error("foreign origin must be rejected")
	}

	req = httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "null")
	if !WebSocketUpgrader.CheckOrigin(req) {
		t.Error("app origin must be allowed")
	}
}
