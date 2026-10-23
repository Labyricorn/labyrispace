// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package aiutil

import (
	"github.com/Labyricorn/labyrispace/pkg/vendorpolicy"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestAIProxyCannotBypassVendorPolicy(t *testing.T) {
	if _, err := MakeHTTPClient("https://api.waveterm.dev/proxy"); err == nil {
		t.Fatal("vendor proxy accepted")
	}
	var requests atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		http.Redirect(w, r, "https://api.waveterm.dev/central/tevents", http.StatusFound)
	}))
	defer proxy.Close()
	client, err := MakeHTTPClient(proxy.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Get("http://example.invalid/")
	if err == nil || !strings.Contains(err.Error(), vendorpolicy.DisabledMessage) {
		t.Fatalf("proxy redirect bypassed policy: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatal("redirect reached proxy instead of being blocked")
	}
}
