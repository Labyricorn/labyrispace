// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

//go:build !windows

package netinfo

func platformConnectivity() string {
	return ConnectivityUnknown
}
