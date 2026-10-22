// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package web

import "strings"

// IsAllowedOrigin decides whether a request's Origin header is acceptable. Requests without an Origin come from
// non-browser clients (the shell helper, Electron main) and are still subject to the auth key. A browser always
// sends Origin on cross-origin and WebSocket requests, so a present value must match the app's own origins.
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
