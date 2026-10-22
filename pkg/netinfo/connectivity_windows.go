// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

//go:build windows

package netinfo

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// NL_NETWORK_CONNECTIVITY_HINT: the level, the cost, then three BOOLEAN flags (padded to 12 bytes).
type connectivityHint struct {
	Level uint32
	Cost  uint32
	Flags [4]byte
}

var procGetNetworkConnectivityHint = windows.NewLazySystemDLL("iphlpapi.dll").NewProc("GetNetworkConnectivityHint")

// platformConnectivity asks Windows what it already knows from its own connectivity checks. Nothing is sent from here.
func platformConnectivity() string {
	if procGetNetworkConnectivityHint.Find() != nil {
		return ConnectivityUnknown
	}
	var hint connectivityHint
	ret, _, _ := procGetNetworkConnectivityHint.Call(uintptr(unsafe.Pointer(&hint)))
	if ret != 0 {
		return ConnectivityUnknown
	}
	return connectivityFromLevel(hint.Level)
}
