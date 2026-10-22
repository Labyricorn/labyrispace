// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"
)

func resetLimiter(t *testing.T) {
	t.Helper()
	limiterMu.Lock()
	lastLatency = time.Time{}
	limiterMu.Unlock()
	nowFunc = time.Now
	t.Cleanup(func() {
		nowFunc = time.Now
		limiterMu.Lock()
		lastLatency = time.Time{}
		limiterMu.Unlock()
	})
}

func fixedGateway(addr string) gatewayFunc {
	return func(ctx context.Context) (string, error) { return addr, nil }
}

func realDial(ctx context.Context, network string, address string) (net.Conn, error) {
	d := net.Dialer{Timeout: time.Second}
	return d.DialContext(ctx, network, address)
}

func TestNormalizeTarget(t *testing.T) {
	good := map[string]string{
		"gateway":        "gateway",
		" GATEWAY ":      "gateway",
		"192.168.1.1":    "192.168.1.1",
		"::1":            "::1",
		"Example.COM":    "example.com",
		"a-b.example":    "a-b.example",
		"::ffff:1.2.3.4": "1.2.3.4",
	}
	for in, want := range good {
		got, err := normalizeTarget(in)
		if err != nil || got != want {
			t.Errorf("%q: got %q %v, want %q", in, got, err, want)
		}
	}
	bad := []string{"", " ", "http://example.com", "example.com/path", "a b", "a\r\nb", "-bad.example", "bad-.example", "exa mple", "a..b", "x@y", strings.Repeat("a", 254)}
	for _, in := range bad {
		if _, err := normalizeTarget(in); err == nil {
			t.Errorf("expected %q to be refused", in)
		}
	}
}

func TestMeasureRefusesUndeclaredHosts(t *testing.T) {
	resetLimiter(t)
	called := false
	dial := func(ctx context.Context, network string, address string) (net.Conn, error) {
		called = true
		return nil, errors.New("must not dial")
	}
	_, err := measure(context.Background(), LatencyRequest{Target: "example.com", AllowedHosts: []string{"other.example"}}, fixedGateway("192.168.1.1"), dial)
	if err == nil || !strings.Contains(err.Error(), "default gateway") {
		t.Fatalf("expected refusal, got %v", err)
	}
	if called {
		t.Error("an undeclared host must never be dialed")
	}
	if _, err := measure(context.Background(), LatencyRequest{Target: "127.0.0.1", AllowedHosts: nil}, fixedGateway("192.168.1.1"), dial); err == nil {
		t.Error("loopback must not be measurable unless declared")
	}
	if called {
		t.Error("nothing should have been dialed")
	}
}

func TestMeasureUsesGatewayWithoutADeclaration(t *testing.T) {
	resetLimiter(t)
	var dialed string
	dial := func(ctx context.Context, network string, address string) (net.Conn, error) {
		dialed = address
		c1, c2 := net.Pipe()
		c2.Close()
		return c1, nil
	}
	res, err := measure(context.Background(), LatencyRequest{Target: "gateway"}, fixedGateway("192.168.1.1"), dial)
	if err != nil {
		t.Fatal(err)
	}
	if dialed != "192.168.1.1:80" || !res.Reachable || res.Resolved != "192.168.1.1" || res.Target != "gateway" {
		t.Errorf("unexpected result %+v dialed %q", res, dialed)
	}
}

func TestMeasureErrorsWhenThereIsNoGateway(t *testing.T) {
	resetLimiter(t)
	noGateway := func(ctx context.Context) (string, error) { return "", errors.New("no default gateway was found") }
	if _, err := measure(context.Background(), LatencyRequest{Target: "gateway"}, noGateway, realDial); err == nil {
		t.Fatal("expected an error")
	}
}

func TestMeasureAgainstRealLoopbackListener(t *testing.T) {
	resetLimiter(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			c.Close()
		}
	}()
	res, err := measure(context.Background(), LatencyRequest{Target: "127.0.0.1", Port: port, AllowedHosts: []string{"127.0.0.1"}}, fixedGateway("192.168.1.1"), realDial)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Reachable || res.Refused || res.Millis < 0 || res.Error != "" {
		t.Errorf("unexpected result %+v", res)
	}
	ln.Close()

	resetLimiter(t)
	res, err = measure(context.Background(), LatencyRequest{Target: "127.0.0.1", Port: port, AllowedHosts: []string{"127.0.0.1"}}, fixedGateway("192.168.1.1"), realDial)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Reachable || !res.Refused {
		t.Errorf("a refused connection still shows the host answered: %+v", res)
	}
}

type timeoutError struct{}

func (timeoutError) Error() string   { return "i/o timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }

func TestMeasureReportsTimeouts(t *testing.T) {
	resetLimiter(t)
	dial := func(ctx context.Context, network string, address string) (net.Conn, error) {
		return nil, timeoutError{}
	}
	res, err := measure(context.Background(), LatencyRequest{Target: "gateway"}, fixedGateway("192.168.1.1"), dial)
	if err != nil {
		t.Fatal(err)
	}
	if res.Reachable || res.Error != "timed out" || res.Millis != 0 {
		t.Errorf("unexpected result %+v", res)
	}
}

func TestMeasureRejectsBadPorts(t *testing.T) {
	resetLimiter(t)
	for _, port := range []int{-1, 65536, 100000} {
		if _, err := measure(context.Background(), LatencyRequest{Target: "gateway", Port: port}, fixedGateway("192.168.1.1"), realDial); err == nil {
			t.Errorf("port %d should be rejected", port)
		}
	}
}

func TestMeasureIsRateLimited(t *testing.T) {
	resetLimiter(t)
	base := time.Now()
	nowFunc = func() time.Time { return base }
	dial := func(ctx context.Context, network string, address string) (net.Conn, error) {
		c1, c2 := net.Pipe()
		c2.Close()
		return c1, nil
	}
	req := LatencyRequest{Target: "gateway"}
	if _, err := measure(context.Background(), req, fixedGateway("192.168.1.1"), dial); err != nil {
		t.Fatal(err)
	}
	if _, err := measure(context.Background(), req, fixedGateway("192.168.1.1"), dial); err == nil || !strings.Contains(err.Error(), "wait") {
		t.Fatalf("expected rate limit, got %v", err)
	}
	nowFunc = func() time.Time { return base.Add(2 * time.Second) }
	if _, err := measure(context.Background(), req, fixedGateway("192.168.1.1"), dial); err != nil {
		t.Fatalf("a later call should work: %v", err)
	}
}
