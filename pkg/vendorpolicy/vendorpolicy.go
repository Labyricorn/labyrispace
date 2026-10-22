// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

// Package vendorpolicy prevents the host application from contacting Wave's
// services. It does not sandbox commands or other programs launched by users.
package vendorpolicy

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

const DisabledMessage = "Wave vendor services are disabled in Labyrispace; configure your own AI provider or use local help"

func IsVendorURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "waveterm.dev" || strings.HasSuffix(host, ".waveterm.dev") {
		return true
	}
	path := strings.ToLower(u.Path)
	ownedPath := func(prefix string) bool { return path == prefix || strings.HasPrefix(path, prefix+"/") }
	switch host {
	case "github.com", "www.github.com":
		return ownedPath("/wavetermdev") || ownedPath("/sponsors/wavetermdev")
	case "api.github.com":
		return ownedPath("/repos/wavetermdev") || ownedPath("/orgs/wavetermdev") || ownedPath("/users/wavetermdev")
	case "raw.githubusercontent.com", "codeload.github.com":
		return ownedPath("/wavetermdev")
	}
	return false
}

type BlockingTransport struct{ Base http.RoundTripper }

func (t *BlockingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if IsVendorURL(req.URL.String()) {
		return nil, fmt.Errorf("%s", DisabledMessage)
	}
	base := t.Base
	if base == nil {
		return nil, fmt.Errorf("vendor policy transport requires a base transport")
	}
	if transport, ok := base.(*http.Transport); ok && transport.Proxy != nil {
		proxy, err := transport.Proxy(req)
		if err != nil {
			return nil, err
		}
		if proxy != nil && IsVendorURL(proxy.String()) {
			return nil, fmt.Errorf("%s", DisabledMessage)
		}
	}
	return base.RoundTrip(req)
}

var installOnce sync.Once

func InstallHTTPPolicy() {
	installOnce.Do(func() {
		http.DefaultTransport = &BlockingTransport{Base: http.DefaultTransport}
	})
}
