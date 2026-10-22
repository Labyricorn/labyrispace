// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package ipkind

import "testing"

func TestClassifyString(t *testing.T) {
	cases := []struct {
		addr string
		want string
	}{
		{"127.0.0.1", Loopback},
		{"::1", Loopback},
		{"10.1.2.3", Private},
		{"172.16.0.9", Private},
		{"192.168.1.1", Private},
		{"fd00::1", Private},
		{"100.64.0.5", Private},
		{"100.127.255.255", Private},
		{"100.128.0.1", Public},
		{"169.254.10.10", LinkLocal},
		{"fe80::1", LinkLocal},
		{"224.0.0.251", LinkLocal},
		{"239.1.1.1", Multicast},
		{"ff02::fb", LinkLocal},
		{"0.0.0.0", Unspecified},
		{"::", Unspecified},
		{"8.8.8.8", Public},
		{"203.0.113.9", Public},
		{"2001:4860:4860::8888", Public},
		{"::ffff:10.0.0.1", Private},
		{"::ffff:8.8.8.8", Public},
	}
	for _, c := range cases {
		got, ok := ClassifyString(c.addr)
		if !ok || got != c.want {
			t.Errorf("%s: got %q %v, want %q", c.addr, got, ok, c.want)
		}
	}
	for _, bad := range []string{"", "nope", "1.2.3", "1.2.3.4.5", "8.8.8.8\n"} {
		if _, ok := ClassifyString(bad); ok {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}
