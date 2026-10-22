// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package localservices

import (
	"context"
	"fmt"
	"net/netip"
	"runtime"
	"sort"
	"strconv"
	"time"

	"github.com/shirou/gopsutil/v4/net"
	"github.com/wavetermdev/waveterm/pkg/ipkind"
)

const MaxConnections = 5000

type Connection struct {
	Protocol       string `json:"protocol"`
	State          string `json:"state"`
	LocalAddress   string `json:"localaddress"`
	LocalPort      int    `json:"localport"`
	RemoteAddress  string `json:"remoteaddress"`
	RemotePort     int    `json:"remoteport"`
	RemoteEndpoint string `json:"remoteendpoint"`
	Family         string `json:"family"`
	RemoteKind     string `json:"remotekind"`
	Pid            int32  `json:"pid"`
	ProcessName    string `json:"processname,omitempty"`
	ProcessPath    string `json:"processpath,omitempty"`
	Identity       string `json:"identity"`
}

type ConnectionsResponse struct {
	Connections []Connection `json:"connections"`
	Ts          int64        `json:"ts"`
	Platform    string       `json:"platform"`
}

type rawPeer struct {
	LocalAddress  string
	LocalPort     int
	RemoteAddress string
	RemotePort    int
	State         string
	Pid           int32
}

// keepPeer keeps TCP sockets that have a remote end. Listening sockets belong to the Local Services view.
func keepPeer(stat net.ConnectionStat) bool {
	if stat.Type != sockStream {
		return false
	}
	switch stat.Status {
	case tcpListenState, "", "NONE", "TIME_WAIT", "CLOSED":
		// TIME_WAIT sockets belong to no process any more and only show recent history.
		return false
	}
	return stat.Raddr.Port != 0 && stat.Raddr.IP != ""
}

func collectPeers(ctx context.Context) ([]rawPeer, error) {
	stats, err := net.ConnectionsWithContext(ctx, "inet")
	if err != nil {
		return nil, fmt.Errorf("could not read local network sockets: %w", err)
	}
	var peers []rawPeer
	for _, stat := range stats {
		if !keepPeer(stat) {
			continue
		}
		peers = append(peers, rawPeer{
			LocalAddress:  stat.Laddr.IP,
			LocalPort:     int(stat.Laddr.Port),
			RemoteAddress: stat.Raddr.IP,
			RemotePort:    int(stat.Raddr.Port),
			State:         stat.Status,
			Pid:           stat.Pid,
		})
	}
	return peers, nil
}

func makeConnection(raw rawPeer) (Connection, bool) {
	local, err := netip.ParseAddr(raw.LocalAddress)
	if err != nil {
		return Connection{}, false
	}
	remote, err := netip.ParseAddr(raw.RemoteAddress)
	if err != nil || raw.RemotePort < 1 || raw.RemotePort > 65535 {
		return Connection{}, false
	}
	local, remote = local.Unmap(), remote.Unmap()
	family := FamilyIPv6
	if remote.Is4() {
		family = FamilyIPv4
	}
	return Connection{
		Protocol:       ProtocolTCP,
		State:          raw.State,
		LocalAddress:   local.String(),
		LocalPort:      raw.LocalPort,
		RemoteAddress:  remote.String(),
		RemotePort:     raw.RemotePort,
		RemoteEndpoint: netip.AddrPortFrom(remote, uint16(raw.RemotePort)).String(),
		Family:         family,
		RemoteKind:     ipkind.Classify(remote),
		Pid:            raw.Pid,
		Identity:       IdentityUnavailable,
	}, true
}

func sortConnections(conns []Connection) {
	rank := map[string]int{ipkind.Public: 0, ipkind.Private: 1, ipkind.LinkLocal: 2, ipkind.Loopback: 3}
	sort.SliceStable(conns, func(i, j int) bool {
		a, b := conns[i], conns[j]
		ra, rb := rank[a.RemoteKind], rank[b.RemoteKind]
		if ra != rb {
			return ra < rb
		}
		if a.RemoteAddress != b.RemoteAddress {
			return a.RemoteAddress < b.RemoteAddress
		}
		return a.RemotePort < b.RemotePort
	})
}

func buildConnections(ctx context.Context, peers []rawPeer) []Connection {
	cache := make(map[int32]*identity)
	fallbackNames := snapshotNames()
	seen := make(map[string]bool)
	conns := make([]Connection, 0, len(peers))
	for _, peer := range peers {
		conn, ok := makeConnection(peer)
		if !ok {
			continue
		}
		key := conn.LocalAddress + "|" + strconv.Itoa(conn.LocalPort) + "|" + conn.RemoteEndpoint + "|" + strconv.Itoa(int(conn.Pid))
		if seen[key] {
			continue
		}
		seen[key] = true
		if id := lookupIdentity(ctx, peer.Pid, cache, fallbackNames); id != nil {
			conn.ProcessName = id.name
			conn.ProcessPath = id.path
			conn.Identity = IdentityKnown
		}
		conns = append(conns, conn)
		if len(conns) >= MaxConnections {
			break
		}
	}
	sortConnections(conns)
	return conns
}

// ListConnections reads the socket table for TCP connections that have a remote end. It opens no connections.
func ListConnections(ctx context.Context) (*ConnectionsResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, ListenTimeout)
	defer cancel()
	peers, err := collectPeers(ctx)
	if err != nil {
		return nil, err
	}
	return &ConnectionsResponse{Connections: buildConnections(ctx, peers), Ts: time.Now().UnixMilli(), Platform: runtime.GOOS}, nil
}
