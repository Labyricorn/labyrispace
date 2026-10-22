// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: remove vendor transports.

// Package wcloud retains compatibility entry points for existing RPC callers.
// Labyrispace deliberately has no Wave cloud HTTP client or endpoint fallback.
package wcloud

import (
	"context"
	"os"
)

func CacheAndRemoveEnvVars() error {
	for _, name := range []string{"WCLOUD_ENDPOINT", "WCLOUD_PING_ENDPOINT", "WCLOUD_WS_ENDPOINT", "WAVETERM_WAVEAI_ENDPOINT"} {
		os.Unsetenv(name)
	}
	return nil
}

func SendAllTelemetry(clientId string) error                                       { return nil }
func SendNoTelemetryUpdate(ctx context.Context, clientId string, value bool) error { return nil }
func SendDiagnosticPing(ctx context.Context, clientId string, enabled bool) error  { return nil }
