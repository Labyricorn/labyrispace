// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package vendorpolicy

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestVendorURLFixtures(t *testing.T) {
	data, err := os.ReadFile("../../testdata/vendor-urls.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		URL     string `json:"url"`
		Blocked bool   `json:"blocked"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		if got := IsVendorURL(f.URL); got != f.Blocked {
			t.Errorf("%s: blocked=%v, want %v", f.URL, got, f.Blocked)
		}
	}
}

func TestTransportBlocksBeforeDialAndAfterRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "https://api.waveterm.dev/central/tevents", http.StatusFound)
			return
		}
		io.WriteString(w, "local service works")
	}))
	defer server.Close()
	transport := &http.Transport{}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: &BlockingTransport{Base: transport}}
	for _, target := range []string{"https://api.waveterm.dev/central/tevents", server.URL + "/redirect"} {
		if _, err := client.Get(target); err == nil || !strings.Contains(err.Error(), DisabledMessage) {
			t.Fatalf("vendor request was not refused: %s, %v", target, err)
		}
	}
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if string(data) != "local service works" {
		t.Fatal("local HTTP broken")
	}
}
