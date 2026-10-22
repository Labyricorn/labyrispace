// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

// connectivityFromLevel maps the values of NL_NETWORK_CONNECTIVITY_LEVEL_HINT.
func connectivityFromLevel(level uint32) string {
	switch level {
	case 1:
		return ConnectivityNone
	case 2:
		return ConnectivityLocal
	case 3, 4:
		return ConnectivityInternet
	}
	return ConnectivityUnknown
}
