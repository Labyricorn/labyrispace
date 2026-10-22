// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package localservices

import (
	"context"
	"fmt"
	"net/netip"
	"sort"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

const (
	ProtocolTCP = "tcp"
	ProtocolUDP = "udp"

	ScopeLoopback  = "loopback"
	ScopeWildcard  = "wildcard"
	ScopeInterface = "interface"

	FamilyIPv4 = "ipv4"
	FamilyIPv6 = "ipv6"

	IdentityKnown       = "known"
	IdentityUnavailable = "unavailable"

	ListenTimeout = 8 * time.Second

	tcpListenState = "LISTEN"
)

const (
	sockStream = 1
	sockDgram  = 2
)

type Service struct {
	Protocol    string `json:"protocol"`
	Address     string `json:"address"`
	Port        int    `json:"port"`
	Family      string `json:"family"`
	Scope       string `json:"scope"`
	Endpoint    string `json:"endpoint"`
	Pid         int32  `json:"pid"`
	ProcessName string `json:"processname,omitempty"`
	ProcessPath string `json:"processpath,omitempty"`
	Identity    string `json:"identity"`
}

type ListResponse struct {
	Services []Service `json:"services"`
	Ts       int64     `json:"ts"`
	Platform string    `json:"platform"`
}

type rawConn struct {
	Protocol string
	Address  string
	Port     int
	Status   string
	Pid      int32
}

// ClassifyAddress reports the address family and whether the bind is loopback, wildcard, or a specific interface.
func ClassifyAddress(address string) (family string, scope string, ok bool) {
	addr, err := netip.ParseAddr(address)
	if err != nil {
		return "", "", false
	}
	addr = addr.Unmap()
	family = FamilyIPv6
	if addr.Is4() {
		family = FamilyIPv4
	}
	switch {
	case addr.IsLoopback():
		return family, ScopeLoopback, true
	case addr.IsUnspecified():
		return family, ScopeWildcard, true
	}
	return family, ScopeInterface, true
}

// FormatEndpoint builds a host:port a client on this machine can use. It is built only from a parsed IP and an
// integer port, so it never contains characters from process-controlled data. Wildcard binds map to loopback.
func FormatEndpoint(address string, port int) (string, bool) {
	addr, err := netip.ParseAddr(address)
	if err != nil || port < 1 || port > 65535 {
		return "", false
	}
	addr = addr.Unmap()
	if addr.IsUnspecified() {
		if addr.Is4() {
			addr = netip.AddrFrom4([4]byte{127, 0, 0, 1})
		} else {
			addr = netip.IPv6Loopback()
		}
	}
	return netip.AddrPortFrom(addr, uint16(port)).String(), true
}

func makeService(raw rawConn) (Service, bool) {
	family, scope, ok := ClassifyAddress(raw.Address)
	if !ok {
		return Service{}, false
	}
	endpoint, ok := FormatEndpoint(raw.Address, raw.Port)
	if !ok {
		return Service{}, false
	}
	addr, _ := netip.ParseAddr(raw.Address)
	return Service{
		Protocol: raw.Protocol,
		Address:  addr.Unmap().String(),
		Port:     raw.Port,
		Family:   family,
		Scope:    scope,
		Endpoint: endpoint,
		Pid:      raw.Pid,
		Identity: IdentityUnavailable,
	}, true
}

func keepConn(stat net.ConnectionStat) (string, bool) {
	switch stat.Type {
	case sockStream:
		if stat.Status != tcpListenState {
			return "", false
		}
		return ProtocolTCP, true
	case sockDgram:
		return ProtocolUDP, true
	}
	return "", false
}

func collectRaw(ctx context.Context) ([]rawConn, error) {
	stats, err := net.ConnectionsWithContext(ctx, "inet")
	if err != nil {
		return nil, fmt.Errorf("could not read local network sockets: %w", err)
	}
	var rtn []rawConn
	for _, stat := range stats {
		proto, keep := keepConn(stat)
		if !keep || stat.Laddr.Port == 0 {
			continue
		}
		rtn = append(rtn, rawConn{Protocol: proto, Address: stat.Laddr.IP, Port: int(stat.Laddr.Port), Status: stat.Status, Pid: stat.Pid})
	}
	return rtn, nil
}

type identity struct {
	name string
	path string
}

func cleanText(text string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, text)
}

func lookupIdentity(ctx context.Context, pid int32, cache map[int32]*identity, fallbackNames map[int32]string) *identity {
	if cached, ok := cache[pid]; ok {
		return cached
	}
	var found *identity
	if pid > 0 {
		if proc, err := process.NewProcessWithContext(ctx, pid); err == nil {
			name, nameErr := proc.NameWithContext(ctx)
			path, _ := proc.ExeWithContext(ctx)
			if nameErr == nil && cleanText(name) != "" {
				found = &identity{name: cleanText(name), path: cleanText(path)}
			}
		}
		if found == nil && cleanText(fallbackNames[pid]) != "" {
			found = &identity{name: cleanText(fallbackNames[pid])}
		}
	}
	cache[pid] = found
	return found
}

func sortServices(services []Service) {
	sort.SliceStable(services, func(i, j int) bool {
		a, b := services[i], services[j]
		if a.Port != b.Port {
			return a.Port < b.Port
		}
		if a.Protocol != b.Protocol {
			return a.Protocol < b.Protocol
		}
		return a.Address < b.Address
	})
}

func buildServices(ctx context.Context, raws []rawConn) []Service {
	cache := make(map[int32]*identity)
	fallbackNames := snapshotNames()
	seen := make(map[string]bool)
	services := make([]Service, 0, len(raws))
	for _, raw := range raws {
		svc, ok := makeService(raw)
		if !ok {
			continue
		}
		dedupeKey := svc.Protocol + "|" + svc.Address + "|" + strconv.Itoa(svc.Port) + "|" + strconv.Itoa(int(svc.Pid))
		if seen[dedupeKey] {
			continue
		}
		seen[dedupeKey] = true
		if id := lookupIdentity(ctx, raw.Pid, cache, fallbackNames); id != nil {
			svc.ProcessName = id.name
			svc.ProcessPath = id.path
			svc.Identity = IdentityKnown
		}
		services = append(services, svc)
	}
	sortServices(services)
	return services
}

// List reads sockets this machine has open. It never connects to any of them.
func List(ctx context.Context) (*ListResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, ListenTimeout)
	defer cancel()
	raws, err := collectRaw(ctx)
	if err != nil {
		return nil, err
	}
	return &ListResponse{Services: buildServices(ctx, raws), Ts: time.Now().UnixMilli(), Platform: runtime.GOOS}, nil
}
