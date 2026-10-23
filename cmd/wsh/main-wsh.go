// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

package main

import (
	"github.com/Labyricorn/labyrispace/cmd/wsh/cmd"
	"github.com/Labyricorn/labyrispace/pkg/vendorpolicy"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
)

// set by main-server.go
var LaspVersion = "0.0.0"
var BuildTime = "0"

func main() {
	vendorpolicy.InstallHTTPPolicy()
	laspbase.LaspVersion = LaspVersion
	laspbase.BuildTime = BuildTime
	cmd.Execute()
}
