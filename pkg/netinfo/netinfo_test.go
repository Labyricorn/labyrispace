// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"net"
	"net/netip"
	"testing"
)

func TestChooseDefault(t *testing.T) {
	adapters := []adapterInfo{
		{Name: "Loopback", Up: true, Loopback: true, Gateways: []string{"127.0.0.1"}, Metric: 1},
		{Name: "Down", Up: false, Gateways: []string{"10.0.0.1"}, Metric: 5},
		{Name: "No gateway", Up: true, Metric: 2},
		{Name: "Slow", Up: true, Gateways: []string{"10.0.0.1"}, Metric: 50},
		{Name: "Fast", Up: true, Gateways: []string{"192.168.1.1"}, Metric: 10},
	}
	if got := chooseDefault(adapters); got != 4 {
		t.Errorf("got %d, want 4", got)
	}
	if got := chooseDefault(adapters[:3]); got != -1 {
		t.Errorf("got %d, want -1", got)
	}
	if got := chooseDefault(nil); got != -1 {
		t.Errorf("got %d, want -1", got)
	}
}

func TestPickGateway(t *testing.T) {
	cases := []struct {
		in   []string
		want string
	}{
		{[]string{"fe80::1", "192.168.1.1"}, "192.168.1.1"},
		{[]string{"fe80::1"}, "fe80::1"},
		{[]string{"0.0.0.0", "::"}, ""},
		{[]string{"junk"}, ""},
		{nil, ""},
	}
	for _, c := range cases {
		if got := pickGateway(c.in); got != c.want {
			t.Errorf("%v: got %q want %q", c.in, got, c.want)
		}
	}
}

func TestMergeInterfacesMarksTheDefaultAndSortsIt(t *testing.T) {
	base := []net.Interface{
		{Name: "Loopback Pseudo-Interface 1", Flags: net.FlagUp | net.FlagLoopback},
		{Name: "Ethernet", Flags: net.FlagUp},
		{Name: "vEthernet", Flags: net.FlagUp},
		{Name: "Wi-Fi", Flags: 0},
	}
	adapters := []adapterInfo{
		{Name: "Ethernet", Description: "Intel NIC", Up: true, Gateways: []string{"fe80::1", "192.168.1.1"}, Metric: 25},
		{Name: "vEthernet", Up: true, Gateways: []string{"172.20.0.1"}, Metric: 5000},
		{Name: "Wi-Fi", Up: false, Metric: 40},
	}
	got := mergeInterfaces(base, adapters)
	if len(got) != 4 {
		t.Fatalf("unexpected result %+v", got)
	}
	if got[0].Name != "Ethernet" || !got[0].IsDefault || got[0].Gateway != "192.168.1.1" || got[0].Description != "Intel NIC" {
		t.Errorf("the default interface should come first: %+v", got[0])
	}
	defaults := 0
	for _, ifc := range got {
		if ifc.IsDefault {
			defaults++
		}
	}
	if defaults != 1 {
		t.Errorf("exactly one default expected, got %d", defaults)
	}
	if got[3].Name != "Wi-Fi" || got[3].Up {
		t.Errorf("down interfaces sort last: %+v", got[3])
	}
}

func TestConnectivityFromLevel(t *testing.T) {
	cases := map[uint32]string{0: ConnectivityUnknown, 1: ConnectivityNone, 2: ConnectivityLocal, 3: ConnectivityInternet, 4: ConnectivityInternet, 99: ConnectivityUnknown}
	for level, want := range cases {
		if got := connectivityFromLevel(level); got != want {
			t.Errorf("level %d: got %q want %q", level, got, want)
		}
	}
}

func TestListReportsLocalStateOnly(t *testing.T) {
	resp, err := List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Interfaces) == 0 {
		t.Fatal("expected at least one interface")
	}
	switch resp.Connectivity {
	case ConnectivityInternet, ConnectivityLocal, ConnectivityNone, ConnectivityUnknown:
	default:
		t.Errorf("unexpected connectivity %q", resp.Connectivity)
	}
	defaults := 0
	for _, ifc := range resp.Interfaces {
		if ifc.IsDefault {
			defaults++
			if ifc.Gateway == "" {
				t.Errorf("a default interface needs a gateway: %+v", ifc)
			} else if _, err := netip.ParseAddr(ifc.Gateway); err != nil {
				t.Errorf("gateway is not an address: %q", ifc.Gateway)
			}
		}
		for _, a := range ifc.Addresses {
			if _, err := netip.ParseAddr(a); err != nil {
				t.Errorf("address %q is not an IP", a)
			}
		}
	}
	if defaults > 1 {
		t.Errorf("at most one default interface, got %d", defaults)
	}
}
