// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package logutil

import (
	"log"

	"github.com/Labyricorn/labyrispace/pkg/laspbase"
)

// DevPrintf logs using log.Printf only if running in dev mode
func DevPrintf(format string, v ...any) {
	if laspbase.IsDevMode() {
		log.Printf(format, v...)
	}
}