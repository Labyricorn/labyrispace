// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package localservices

import (
	"context"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/Labyricorn/labyrispace/pkg/ipkind"
)

func TestKeepPeer(t *testing.T) {
	remote := gnet.Addr{IP: "93.184.216.34", Port: 443}
	cases := []struct {
		name string
		stat gnet.ConnectionStat
		want bool
	}{
		{"established", gnet.ConnectionStat{Type: sockStream, Status: "ESTABLISHED", Raddr: remote}, true},
		{"syn sent", gnet.ConnectionStat{Type: sockStream, Status: "SYN_SENT", Raddr: remote}, true},
		{"listening", gnet.ConnectionStat{Type: sockStream, Status: tcpListenState, Raddr: remote}, false},
		{"time wait", gnet.ConnectionStat{Type: sockStream, Status: "TIME_WAIT", Raddr: remote}, false},
		{"udp", gnet.ConnectionStat{Type: sockDgram, Status: "", Raddr: remote}, false},
		{"no remote", gnet.ConnectionStat{Type: sockStream, Status: "ESTABLISHED"}, false},
	}
	for _, c := range cases {
		if got := keepPeer(c.stat); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestMakeConnectionFormatsAndClassifies(t *testing.T) {
	conn, ok := makeConnection(rawPeer{LocalAddress: "192.168.1.5", LocalPort: 50000, RemoteAddress: "203.0.113.9", RemotePort: 443, State: "ESTABLISHED", Pid: 4})
	if !ok || conn.RemoteEndpoint != "203.0.113.9:443" || conn.RemoteKind != ipkind.Public || conn.Family != FamilyIPv4 {
		t.Fatalf("unexpected connection %+v %v", conn, ok)
	}
	v6, ok := makeConnection(rawPeer{LocalAddress: "2001:db8::2", LocalPort: 50001, RemoteAddress: "2001:db8::1", RemotePort: 443, State: "ESTABLISHED"})
	if !ok || v6.RemoteEndpoint != "[2001:db8::1]:443" || v6.Family != FamilyIPv6 {
		t.Fatalf("unexpected IPv6 connection %+v", v6)
	}
	mapped, ok := makeConnection(rawPeer{LocalAddress: "::ffff:10.0.0.2", LocalPort: 1, RemoteAddress: "::ffff:10.0.0.9", RemotePort: 80, State: "ESTABLISHED"})
	if !ok || mapped.RemoteAddress != "10.0.0.9" || mapped.RemoteKind != ipkind.Private || mapped.Family != FamilyIPv4 {
		t.Fatalf("unexpected mapped connection %+v", mapped)
	}
	for _, bad := range []rawPeer{
		{LocalAddress: "bogus", RemoteAddress: "1.2.3.4", RemotePort: 80},
		{LocalAddress: "1.2.3.4", RemoteAddress: "x\r\ny", RemotePort: 80},
		{LocalAddress: "1.2.3.4", RemoteAddress: "5.6.7.8", RemotePort: 0},
		{LocalAddress: "1.2.3.4", RemoteAddress: "5.6.7.8", RemotePort: 70000},
	} {
		if _, ok := makeConnection(bad); ok {
			t.Errorf("expected rejection of %+v", bad)
		}
	}
}

func TestBuildConnectionsSortsDedupesAndMarksMissingProcesses(t *testing.T) {
	peers := []rawPeer{
		{LocalAddress: "127.0.0.1", LocalPort: 1, RemoteAddress: "127.0.0.1", RemotePort: 2, State: "ESTABLISHED", Pid: 2147480000},
		{LocalAddress: "10.0.0.2", LocalPort: 3, RemoteAddress: "10.0.0.9", RemotePort: 80, State: "ESTABLISHED", Pid: 2147480000},
		{LocalAddress: "10.0.0.2", LocalPort: 4, RemoteAddress: "203.0.113.9", RemotePort: 443, State: "ESTABLISHED", Pid: 2147480000},
		{LocalAddress: "10.0.0.2", LocalPort: 4, RemoteAddress: "203.0.113.9", RemotePort: 443, State: "ESTABLISHED", Pid: 2147480000},
		{LocalAddress: "bogus", LocalPort: 5, RemoteAddress: "203.0.113.9", RemotePort: 443, State: "ESTABLISHED"},
	}
	conns := buildConnections(context.Background(), peers)
	if len(conns) != 3 {
		t.Fatalf("expected 3 connections, got %d: %+v", len(conns), conns)
	}
	order := []string{ipkind.Public, ipkind.Private, ipkind.Loopback}
	for i, want := range order {
		if conns[i].RemoteKind != want {
			t.Errorf("position %d: got %s want %s", i, conns[i].RemoteKind, want)
		}
		if conns[i].Identity != IdentityUnavailable || conns[i].ProcessName != "" {
			t.Errorf("a missing process must be unavailable: %+v", conns[i])
		}
	}
}

func establishedPair(t *testing.T, network string, addr string) (client net.Conn, server net.Conn, closeAll func()) {
	t.Helper()
	ln, err := net.Listen(network, addr)
	if err != nil {
		t.Skipf("cannot listen on %s: %v", addr, err)
	}
	accepted := make(chan net.Conn, 1)
	go func() {
		c, _ := ln.Accept()
		accepted <- c
	}()
	client, err = net.Dial(network, ln.Addr().String())
	if err != nil {
		ln.Close()
		t.Fatal(err)
	}
	server = <-accepted
	return client, server, func() {
		client.Close()
		if server != nil {
			server.Close()
		}
		ln.Close()
	}
}

func findConn(conns []Connection, localPort int, remotePort int) *Connection {
	for i := range conns {
		if conns[i].LocalPort == localPort && conns[i].RemotePort == remotePort && conns[i].State == "ESTABLISHED" {
			return &conns[i]
		}
	}
	return nil
}

func TestListConnectionsSeesRealLoopbackConnections(t *testing.T) {
	for _, tc := range []struct{ network, addr, family, remote string }{
		{"tcp", "127.0.0.1:0", FamilyIPv4, "127.0.0.1"},
		{"tcp", "[::1]:0", FamilyIPv6, "::1"},
	} {
		client, _, closeAll := establishedPair(t, tc.network, tc.addr)
		clientPort := client.LocalAddr().(*net.TCPAddr).Port
		serverPort := client.RemoteAddr().(*net.TCPAddr).Port
		resp, err := ListConnections(context.Background())
		if err != nil {
			closeAll()
			t.Fatal(err)
		}
		conn := findConn(resp.Connections, clientPort, serverPort)
		if conn == nil {
			closeAll()
			t.Fatalf("%s: client side of %d->%d not found", tc.family, clientPort, serverPort)
		}
		if conn.Family != tc.family || conn.RemoteKind != ipkind.Loopback || conn.RemoteAddress != tc.remote {
			t.Errorf("%s: unexpected connection %+v", tc.family, *conn)
		}
		if conn.Pid != int32(os.Getpid()) {
			t.Errorf("%s: expected pid %d, got %d", tc.family, os.Getpid(), conn.Pid)
		}
		if findConn(resp.Connections, serverPort, clientPort) == nil {
			t.Errorf("%s: server side of the pair not found", tc.family)
		}
		closeAll()
		time.Sleep(300 * time.Millisecond)
		after, err := ListConnections(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if findConn(after.Connections, clientPort, serverPort) != nil {
			t.Errorf("%s: a closed connection %s is still reported as established", tc.family, strconv.Itoa(clientPort))
		}
	}
}

func TestListConnectionsOmitsListeningSockets(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	resp, err := ListConnections(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range resp.Connections {
		if c.LocalPort == port && c.State == tcpListenState {
			t.Fatalf("listening socket leaked into connections: %+v", c)
		}
	}
}
