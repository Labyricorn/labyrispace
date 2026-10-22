// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	GatewayTarget      = "gateway"
	DefaultLatencyPort = 80
	LatencyTimeout     = 2 * time.Second
	MinLatencyInterval = time.Second

	windowsConnRefused = 10061
)

var hostnamePattern = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$`)

type LatencyRequest struct {
	Target       string
	Port         int
	AllowedHosts []string
}

type LatencyResult struct {
	Target    string  `json:"target"`
	Resolved  string  `json:"resolved"`
	Port      int     `json:"port"`
	Reachable bool    `json:"reachable"`
	Refused   bool    `json:"refused,omitempty"`
	Millis    float64 `json:"millis"`
	Error     string  `json:"error,omitempty"`
}

type gatewayFunc func(ctx context.Context) (string, error)
type dialFunc func(ctx context.Context, network string, address string) (net.Conn, error)

var (
	nowFunc     = time.Now
	limiterMu   sync.Mutex
	lastLatency time.Time
)

func allowCall() error {
	limiterMu.Lock()
	defer limiterMu.Unlock()
	now := nowFunc()
	if !lastLatency.IsZero() && now.Sub(lastLatency) < MinLatencyInterval {
		return fmt.Errorf("wait a moment before measuring again")
	}
	lastLatency = now
	return nil
}

// normalizeTarget accepts "gateway", an IP address, or a plain host name. Anything else (URLs, paths, spaces,
// control characters) is refused before any network call.
func normalizeTarget(target string) (string, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", fmt.Errorf("a target is required")
	}
	if len(target) > 253 {
		return "", fmt.Errorf("the target is too long")
	}
	if strings.EqualFold(target, GatewayTarget) {
		return GatewayTarget, nil
	}
	if addr, err := netip.ParseAddr(target); err == nil {
		return addr.Unmap().String(), nil
	}
	if hostnamePattern.MatchString(target) {
		return strings.ToLower(target), nil
	}
	return "", fmt.Errorf("the target must be a host name or an IP address")
}

func isAllowedHost(target string, allowed []string) bool {
	for _, host := range allowed {
		normalized, err := normalizeTarget(host)
		if err == nil && normalized == target {
			return true
		}
	}
	return false
}

func isRefused(err error) bool {
	var errno syscall.Errno
	if !errors.As(err, &errno) {
		return false
	}
	return errno == syscall.ECONNREFUSED || (runtime.GOOS == "windows" && int(errno) == windowsConnRefused)
}

func friendlyDialError(err error) string {
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timed out"
	}
	if errors.Is(err, context.Canceled) {
		return "cancelled"
	}
	return "could not connect"
}

func measure(ctx context.Context, req LatencyRequest, gateway gatewayFunc, dial dialFunc) (*LatencyResult, error) {
	port := req.Port
	if port == 0 {
		port = DefaultLatencyPort
	}
	if port < 1 || port > 65535 {
		return nil, fmt.Errorf("the port must be between 1 and 65535")
	}
	target, err := normalizeTarget(req.Target)
	if err != nil {
		return nil, err
	}
	resolved := target
	if target == GatewayTarget {
		resolved, err = gateway(ctx)
		if err != nil {
			return nil, err
		}
	} else if !isAllowedHost(target, req.AllowedHosts) {
		return nil, fmt.Errorf("this widget may only measure your default gateway or hosts it declared")
	}
	if err := allowCall(); err != nil {
		return nil, err
	}
	result := &LatencyResult{Target: target, Resolved: resolved, Port: port}
	start := nowFunc()
	conn, err := dial(ctx, "tcp", net.JoinHostPort(resolved, strconv.Itoa(port)))
	result.Millis = float64(nowFunc().Sub(start).Microseconds()) / 1000
	if err == nil {
		conn.Close()
		result.Reachable = true
		return result, nil
	}
	if isRefused(err) {
		// A refusal still means the host answered, so the round trip time is real.
		result.Reachable = true
		result.Refused = true
		return result, nil
	}
	result.Millis = 0
	result.Error = friendlyDialError(err)
	return result, nil
}

// MeasureLatency times one TCP connection to the default gateway or to a host the caller was allowed to name.
func MeasureLatency(ctx context.Context, req LatencyRequest) (*LatencyResult, error) {
	dialer := &net.Dialer{Timeout: LatencyTimeout}
	return measure(ctx, req, DefaultGateway, dialer.DialContext)
}
