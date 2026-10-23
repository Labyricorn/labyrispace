// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"fmt"
	"net/netip"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wavetermdev/waveterm/pkg/ipkind"
)

const (
	TraceTimeout     = 40 * time.Second
	MinTraceInterval = 2 * time.Second
	MaxTraceHops     = 20
)

var (
	hopLinePattern = regexp.MustCompile(`^\s*(\d{1,2})\s+(.*)$`)
	hopMsPattern   = regexp.MustCompile(`(<?)(\d+(?:[.,]\d+)?)\s*ms`)

	traceLimiterMu sync.Mutex
	lastTrace      time.Time
)

type TraceHop struct {
	Hop      int     `json:"hop"`
	Address  string  `json:"address,omitempty"`
	Millis   float64 `json:"millis,omitempty"`
	TimedOut bool    `json:"timedout,omitempty"`
}

type TraceResult struct {
	Target  string     `json:"target"`
	Hops    []TraceHop `json:"hops"`
	Partial bool       `json:"partial,omitempty"`
}

type traceRunner func(ctx context.Context, name string, args ...string) ([]byte, error)

func allowTrace() error {
	traceLimiterMu.Lock()
	defer traceLimiterMu.Unlock()
	now := time.Now()
	if !lastTrace.IsZero() && now.Sub(lastTrace) < MinTraceInterval {
		return fmt.Errorf("wait a moment before tracing again")
	}
	lastTrace = now
	return nil
}

// traceCommand never goes through a shell, and the target is always a parsed public IP literal, never text from the caller.
func traceCommand(addr netip.Addr, goos string) (string, []string) {
	family := "-4"
	if addr.Is6() {
		family = "-6"
	}
	if goos == "windows" {
		return "tracert", []string{"-d", family, "-h", strconv.Itoa(MaxTraceHops), "-w", "800", addr.String()}
	}
	return "traceroute", []string{"-n", family, "-m", strconv.Itoa(MaxTraceHops), "-q", "1", "-w", "1", addr.String()}
}

func parseTraceOutput(output string) []TraceHop {
	var hops []TraceHop
	for _, line := range strings.Split(output, "\n") {
		m := hopLinePattern.FindStringSubmatch(strings.TrimRight(line, "\r"))
		if m == nil {
			continue
		}
		number, _ := strconv.Atoi(m[1])
		hop := TraceHop{Hop: number}
		for _, token := range strings.Fields(m[2]) {
			token = strings.Trim(token, "[]()")
			if addr, err := netip.ParseAddr(token); err == nil {
				hop.Address = addr.Unmap().String()
				break
			}
		}
		if hop.Address == "" {
			hop.TimedOut = true
			hops = append(hops, hop)
			continue
		}
		if ms := hopMsPattern.FindStringSubmatch(m[2]); ms != nil {
			hop.Millis, _ = strconv.ParseFloat(strings.Replace(ms[2], ",", ".", 1), 64)
		}
		hops = append(hops, hop)
	}
	return hops
}

func runTrace(ctx context.Context, target string, goos string, run traceRunner) (*TraceResult, error) {
	addr, err := netip.ParseAddr(strings.TrimSpace(target))
	if err != nil {
		return nil, fmt.Errorf("the target must be an IP address")
	}
	addr = addr.Unmap()
	if ipkind.Classify(addr) != ipkind.Public {
		return nil, fmt.Errorf("only public addresses can be traced")
	}
	if err := allowTrace(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, TraceTimeout)
	defer cancel()
	name, args := traceCommand(addr, goos)
	out, runErr := run(ctx, name, args...)
	result := &TraceResult{Target: addr.String(), Hops: parseTraceOutput(string(out))}
	if runErr != nil {
		if len(result.Hops) == 0 {
			return nil, fmt.Errorf("the trace could not run on this computer")
		}
		result.Partial = true
	}
	return result, nil
}

// TraceRoute lists the routers between this computer and one public address, using the system's own trace tool.
func TraceRoute(ctx context.Context, target string) (*TraceResult, error) {
	return runTrace(ctx, target, runtime.GOOS, func(ctx context.Context, name string, args ...string) ([]byte, error) {
		cmd := exec.CommandContext(ctx, name, args...)
		hideWindow(cmd)
		return cmd.Output()
	})
}
