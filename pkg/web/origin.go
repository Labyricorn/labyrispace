// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package web

import (
	"strings"

	"github.com/wavetermdev/waveterm/pkg/wavebase"
)

// AppOrigins lists the Origin values the app's own windows are expected to send.
// Production app windows are loaded with webContents.loadFile(), which Chromium reports as the opaque
// origin "null" for both HTTP fetch and WebSocket upgrades. In dev mode the renderer is served by the
// Vite dev server over http://localhost, which already gets permissive CORS treatment elsewhere
// (RunWebServer's dev-mode wrapper), so the origin check is skipped entirely rather than guessing a port.
var AppOrigins = []string{"null"}

// IsAllowedOrigin decides whether a request's Origin header is acceptable. Requests without an Origin come from
// non-browser clients (the shell helper, Electron main) and are still subject to the auth key. A browser always
// sends Origin on cross-origin and WebSocket requests, so a present value must match the app's own origins.
// IsAllowedOriginForRequest applies IsAllowedOrigin using the app's known origins, except in dev mode
// where RunWebServer already reflects any origin via permissive CORS headers, so the check is skipped.
func IsAllowedOriginForRequest(origin string) bool {
	if wavebase.IsDevMode() {
		return true
	}
	return IsAllowedOrigin(origin, AppOrigins)
}

func IsAllowedOrigin(origin string, allowed []string) bool {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return true
	}
	for _, candidate := range allowed {
		if strings.EqualFold(origin, strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}
