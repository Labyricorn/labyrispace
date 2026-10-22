// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wcloud

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestLegacyCloudCallsCannotSendRequests(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests.Add(1) }))
	defer server.Close()
	t.Setenv("WCLOUD_ENDPOINT", server.URL)
	t.Setenv("WCLOUD_PING_ENDPOINT", server.URL)
	if err := CacheAndRemoveEnvVars(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, err := range []error{SendAllTelemetry("test"), SendNoTelemetryUpdate(ctx, "test", true), SendDiagnosticPing(ctx, "test", true)} {
		if err != nil {
			t.Fatal(err)
		}
	}
	if requests.Load() != 0 {
		t.Fatal("legacy caller made a cloud request")
	}
}
