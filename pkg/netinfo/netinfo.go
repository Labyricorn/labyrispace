// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	ConnectivityInternet = "internet"
	ConnectivityLocal    = "local"
	ConnectivityNone     = "none"
	ConnectivityUnknown  = "unknown"

	maxAddressesPerInterface = 16
)

type Interface struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Up          bool     `json:"up"`
	Loopback    bool     `json:"loopback"`
	Addresses   []string `json:"addresses"`
	Gateway     string   `json:"gateway,omitempty"`
	IsDefault   bool     `json:"isdefault"`
}

type InterfacesResponse struct {
	Interfaces   []Interface `json:"interfaces"`
	Connectivity string      `json:"connectivity"`
	Ts           int64       `json:"ts"`
	Platform     string      `json:"platform"`
}

// adapterInfo is what the operating system reports about an adapter beyond what the standard library exposes.
type adapterInfo struct {
	Name        string
	Description string
	Up          bool
	Loopback    bool
	Gateways    []string
	Metric      uint32
}

// chooseDefault picks the adapter most likely to carry the default route: up, not loopback, with a gateway,
// and the lowest metric. It returns -1 when there is none.
func chooseDefault(adapters []adapterInfo) int {
	best := -1
	for i, a := range adapters {
		if !a.Up || a.Loopback || len(a.Gateways) == 0 {
			continue
		}
		if best < 0 || a.Metric < adapters[best].Metric {
			best = i
		}
	}
	return best
}

func pickGateway(gateways []string) string {
	first := ""
	for _, g := range gateways {
		addr, err := netip.ParseAddr(g)
		if err != nil || addr.IsUnspecified() {
			continue
		}
		if addr.Unmap().Is4() {
			return addr.Unmap().String()
		}
		if first == "" {
			first = addr.String()
		}
	}
	return first
}

func sortedAddresses(ifc net.Interface) []string {
	addrs, err := ifc.Addrs()
	if err != nil {
		return nil
	}
	var v4, v6 []string
	for _, a := range addrs {
		prefix, err := netip.ParsePrefix(a.String())
		if err != nil {
			continue
		}
		ip := prefix.Addr().Unmap()
		if ip.IsUnspecified() {
			continue
		}
		if ip.Is4() {
			v4 = append(v4, ip.String())
		} else {
			v6 = append(v6, ip.String())
		}
	}
	all := append(v4, v6...)
	if len(all) > maxAddressesPerInterface {
		all = all[:maxAddressesPerInterface]
	}
	return all
}

func mergeInterfaces(base []net.Interface, adapters []adapterInfo) []Interface {
	byName := make(map[string]adapterInfo, len(adapters))
	for _, a := range adapters {
		byName[strings.ToLower(a.Name)] = a
	}
	defaultIdx := chooseDefault(adapters)
	defaultName := ""
	if defaultIdx >= 0 {
		defaultName = strings.ToLower(adapters[defaultIdx].Name)
	}
	result := make([]Interface, 0, len(base))
	for _, ifc := range base {
		entry := Interface{
			Name:      ifc.Name,
			Up:        ifc.Flags&net.FlagUp != 0,
			Loopback:  ifc.Flags&net.FlagLoopback != 0,
			Addresses: sortedAddresses(ifc),
		}
		if a, ok := byName[strings.ToLower(ifc.Name)]; ok {
			entry.Description = a.Description
			entry.Up = a.Up
			entry.Gateway = pickGateway(a.Gateways)
			entry.IsDefault = strings.ToLower(ifc.Name) == defaultName
		}
		result = append(result, entry)
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsDefault != result[j].IsDefault {
			return result[i].IsDefault
		}
		if result[i].Up != result[j].Up {
			return result[i].Up
		}
		return result[i].Name < result[j].Name
	})
	return result
}

// List reports local interfaces, the default gateway, and the operating system's own view of connectivity.
// It sends no traffic.
func List(ctx context.Context) (*InterfacesResponse, error) {
	base, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("could not list network interfaces: %w", err)
	}
	adapters, _ := platformAdapters()
	return &InterfacesResponse{
		Interfaces:   mergeInterfaces(base, adapters),
		Connectivity: platformConnectivity(),
		Ts:           time.Now().UnixMilli(),
		Platform:     runtime.GOOS,
	}, nil
}

// DefaultGateway returns the gateway of the default-route interface, preferring IPv4.
func DefaultGateway(ctx context.Context) (string, error) {
	resp, err := List(ctx)
	if err != nil {
		return "", err
	}
	for _, ifc := range resp.Interfaces {
		if ifc.IsDefault && ifc.Gateway != "" {
			return ifc.Gateway, nil
		}
	}
	return "", fmt.Errorf("no default gateway was found")
}
