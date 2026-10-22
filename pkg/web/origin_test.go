// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package web

import "testing"

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

// The tests below describe behavior that is not wired into the handlers yet (see SECURITY-TEST-PLAN.md).
// Remove the skips when the origin and content-type checks are connected.

func TestWebFnWrapRejectsForeignOrigin(t *testing.T) {
	t.Skip("pending: origin check is not wired into WebFnWrap")
}

func TestServiceRouteRequiresJSONContentType(t *testing.T) {
	t.Skip("pending: content-type check is not wired into the service route")
}

func TestWebSocketUpgraderRejectsForeignOrigin(t *testing.T) {
	t.Skip("pending: WebSocketUpgrader.CheckOrigin still accepts every origin")
}
