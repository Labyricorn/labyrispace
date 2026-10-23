// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"errors"
	"testing"
	"time"
)

const windowsTrace = `
Tracing route to 8.8.8.8 over a maximum of 20 hops

  1    <1 ms    <1 ms    <1 ms  192.168.1.1
  2     *        *        *     Request timed out.
  3    12 ms    11 ms    13 ms  203.0.113.9

Trace complete.
`

const unixTrace = `traceroute to 8.8.8.8 (8.8.8.8), 20 hops max
 1  192.168.1.1  0.512 ms
 2  *
 3  203.0.113.9  12.4 ms
`

func resetTraceLimiter(t *testing.T) {
	t.Helper()
	traceLimiterMu.Lock()
	lastTrace = time.Time{}
	traceLimiterMu.Unlock()
}

func TestParseTraceOutput(t *testing.T) {
	for name, text := range map[string]string{"windows": windowsTrace, "unix": unixTrace} {
		hops := parseTraceOutput(text)
		if len(hops) != 3 {
			t.Fatalf("%s: got %d hops", name, len(hops))
		}
		if hops[0].Address != "192.168.1.1" || hops[1].Address != "" || !hops[1].TimedOut || hops[2].Address != "203.0.113.9" {
			t.Fatalf("%s: wrong hops %+v", name, hops)
		}
		if hops[2].Millis < 12 || hops[2].Millis > 12.5 {
			t.Fatalf("%s: wrong time %v", name, hops[2].Millis)
		}
	}
}

func TestRunTraceRefusesNonPublicTargets(t *testing.T) {
	for _, target := range []string{"", "example.com", "192.168.1.1", "127.0.0.1", "::1", "8.8.8.8; calc", "-h"} {
		resetTraceLimiter(t)
		_, err := runTrace(context.Background(), target, "linux", func(context.Context, string, ...string) ([]byte, error) {
			t.Fatalf("ran a trace for %q", target)
			return nil, nil
		})
		if err == nil {
			t.Fatalf("expected %q to be refused", target)
		}
	}
}

func TestRunTraceUsesIpLiteralWithoutShell(t *testing.T) {
	resetTraceLimiter(t)
	var gotName string
	var gotArgs []string
	res, err := runTrace(context.Background(), "8.8.8.8", "windows", func(_ context.Context, name string, args ...string) ([]byte, error) {
		gotName, gotArgs = name, args
		return []byte(windowsTrace), nil
	})
	if err != nil || len(res.Hops) != 3 || gotName != "tracert" || gotArgs[len(gotArgs)-1] != "8.8.8.8" {
		t.Fatalf("unexpected result %+v %v %s %v", res, err, gotName, gotArgs)
	}
	if _, err := runTrace(context.Background(), "8.8.8.8", "windows", nil); err == nil {
		t.Fatalf("expected the rate limit to apply")
	}
}

func TestRunTracePartialAndFailure(t *testing.T) {
	resetTraceLimiter(t)
	res, err := runTrace(context.Background(), "8.8.8.8", "linux", func(context.Context, string, ...string) ([]byte, error) {
		return []byte(unixTrace), errors.New("killed")
	})
	if err != nil || !res.Partial {
		t.Fatalf("expected a partial result, got %+v %v", res, err)
	}
	resetTraceLimiter(t)
	if _, err := runTrace(context.Background(), "8.8.8.8", "linux", func(context.Context, string, ...string) ([]byte, error) {
		return nil, errors.New("not found")
	}); err == nil {
		t.Fatalf("expected an error when nothing ran")
	}
}
