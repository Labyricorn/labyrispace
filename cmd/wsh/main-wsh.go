// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

package main

import (
	"github.com/wavetermdev/waveterm/cmd/wsh/cmd"
	"github.com/wavetermdev/waveterm/pkg/vendorpolicy"
	"github.com/wavetermdev/waveterm/pkg/wavebase"
)

// set by main-server.go
var WaveVersion = "0.0.0"
var BuildTime = "0"

func main() {
	vendorpolicy.InstallHTTPPolicy()
	wavebase.WaveVersion = WaveVersion
	wavebase.BuildTime = BuildTime
	cmd.Execute()
}
