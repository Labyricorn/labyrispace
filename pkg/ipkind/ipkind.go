// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package ipkind

import "net/netip"

const (
	Loopback    = "loopback"
	Private     = "private"
	LinkLocal   = "linklocal"
	Multicast   = "multicast"
	Unspecified = "unspecified"
	Public      = "public"
)

var sharedAddressSpace = netip.MustParsePrefix("100.64.0.0/10")

// Classify says whether an address is something a geolocation database can say anything about.
// Only Public addresses are worth looking up; everything else is on this machine or its own network.
func Classify(addr netip.Addr) string {
	addr = addr.Unmap()
	switch {
	case !addr.IsValid():
		return Unspecified
	case addr.IsUnspecified():
		return Unspecified
	case addr.IsLoopback():
		return Loopback
	case addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsInterfaceLocalMulticast():
		return LinkLocal
	case addr.IsMulticast():
		return Multicast
	case addr.IsPrivate() || sharedAddressSpace.Contains(addr):
		return Private
	}
	return Public
}

func ClassifyString(address string) (string, bool) {
	addr, err := netip.ParseAddr(address)
	if err != nil {
		return "", false
	}
	return Classify(addr), true
}
