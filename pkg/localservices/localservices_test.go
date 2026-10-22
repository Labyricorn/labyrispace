// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package localservices

import (
	"context"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"

	gnet "github.com/shirou/gopsutil/v4/net"
)

func TestClassifyAddress(t *testing.T) {
	cases := []struct {
		addr, family, scope string
	}{
		{"127.0.0.1", FamilyIPv4, ScopeLoopback},
		{"127.5.6.7", FamilyIPv4, ScopeLoopback},
		{"::1", FamilyIPv6, ScopeLoopback},
		{"0.0.0.0", FamilyIPv4, ScopeWildcard},
		{"::", FamilyIPv6, ScopeWildcard},
		{"::ffff:0.0.0.0", FamilyIPv4, ScopeWildcard},
		{"192.168.1.20", FamilyIPv4, ScopeInterface},
		{"fe80::1", FamilyIPv6, ScopeInterface},
	}
	for _, c := range cases {
		family, scope, ok := ClassifyAddress(c.addr)
		if !ok || family != c.family || scope != c.scope {
			t.Errorf("%s: got %q %q %v, want %q %q", c.addr, family, scope, ok, c.family, c.scope)
		}
	}
	if _, _, ok := ClassifyAddress("not an ip"); ok {
		t.Error("expected invalid address to be rejected")
	}
}

func TestFormatEndpoint(t *testing.T) {
	cases := []struct {
		addr string
		port int
		want string
	}{
		{"127.0.0.1", 8080, "127.0.0.1:8080"},
		{"0.0.0.0", 3000, "127.0.0.1:3000"},
		{"::", 3000, "[::1]:3000"},
		{"::1", 5173, "[::1]:5173"},
		{"192.168.1.20", 22, "192.168.1.20:22"},
		{"fe80::1", 22, "[fe80::1]:22"},
	}
	for _, c := range cases {
		got, ok := FormatEndpoint(c.addr, c.port)
		if !ok || got != c.want {
			t.Errorf("%s:%d: got %q %v, want %q", c.addr, c.port, got, ok, c.want)
		}
	}
	for _, bad := range []struct {
		addr string
		port int
	}{{"1.2.3.4\r\nrm -rf", 80}, {"127.0.0.1", 0}, {"127.0.0.1", 70000}, {"", 80}} {
		if got, ok := FormatEndpoint(bad.addr, bad.port); ok {
			t.Errorf("expected rejection of %q:%d, got %q", bad.addr, bad.port, got)
		}
	}
}

func TestFormatEndpointHasNoControlCharacters(t *testing.T) {
	got, ok := FormatEndpoint("127.0.0.1", 80)
	if !ok || strings.ContainsAny(got, "\r\n\x1b\t ") {
		t.Fatalf("unexpected endpoint %q", got)
	}
}

func TestKeepConn(t *testing.T) {
	if _, ok := keepConn(gnet.ConnectionStat{Type: sockStream, Status: "ESTABLISHED"}); ok {
		t.Error("established TCP connections must be ignored")
	}
	if proto, ok := keepConn(gnet.ConnectionStat{Type: sockStream, Status: tcpListenState}); !ok || proto != ProtocolTCP {
		t.Error("listening TCP must be kept")
	}
	if proto, ok := keepConn(gnet.ConnectionStat{Type: sockDgram}); !ok || proto != ProtocolUDP {
		t.Error("UDP bindings must be kept")
	}
}

func TestListFindsOwnTCPAndUDPSockets(t *testing.T) {
	tcp, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tcp.Close()
	tcpPort := tcp.Addr().(*net.TCPAddr).Port

	udp, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer udp.Close()
	udpPort := udp.LocalAddr().(*net.UDPAddr).Port

	tcp6, tcp6Err := net.Listen("tcp", "[::1]:0")
	tcp6Port := 0
	if tcp6Err == nil {
		defer tcp6.Close()
		tcp6Port = tcp6.Addr().(*net.TCPAddr).Port
	}

	resp, err := List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	services := resp.Services
	find := func(proto string, port int) *Service {
		for i := range services {
			if services[i].Protocol == proto && services[i].Port == port {
				return &services[i]
			}
		}
		return nil
	}

	svc := find(ProtocolTCP, tcpPort)
	if svc == nil {
		t.Fatalf("listening TCP port %d not found", tcpPort)
	}
	if svc.Scope != ScopeLoopback || svc.Family != FamilyIPv4 || svc.Endpoint != "127.0.0.1:"+strconv.Itoa(tcpPort) {
		t.Errorf("unexpected TCP service %+v", *svc)
	}
	if svc.Pid != int32(os.Getpid()) {
		t.Errorf("expected pid %d, got %d", os.Getpid(), svc.Pid)
	}
	if svc.Identity == IdentityKnown && svc.ProcessName == "" {
		t.Errorf("known identity without a name: %+v", *svc)
	}

	udpSvc := find(ProtocolUDP, udpPort)
	if udpSvc == nil {
		t.Fatalf("UDP port %d not found", udpPort)
	}
	if udpSvc.Scope != ScopeLoopback {
		t.Errorf("unexpected UDP service %+v", *udpSvc)
	}

	if tcp6Err == nil {
		svc6 := find(ProtocolTCP, tcp6Port)
		if svc6 == nil {
			t.Fatalf("IPv6 listener %d not found", tcp6Port)
		}
		if svc6.Family != FamilyIPv6 || svc6.Endpoint != "[::1]:"+strconv.Itoa(tcp6Port) {
			t.Errorf("unexpected IPv6 service %+v", *svc6)
		}
	}
}

func TestListLeavesClosedSocketsOut(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	resp, err := List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, svc := range resp.Services {
		if svc.Protocol == ProtocolTCP && svc.Port == port && svc.Pid == int32(os.Getpid()) {
			t.Fatalf("closed listener %d still reported", port)
		}
	}
}

func TestBuildServicesMarksMissingProcessUnavailable(t *testing.T) {
	services := buildServices(context.Background(), []rawConn{
		{Protocol: ProtocolTCP, Address: "127.0.0.1", Port: 4000, Status: tcpListenState, Pid: 2147480000},
		{Protocol: ProtocolTCP, Address: "127.0.0.1", Port: 4000, Status: tcpListenState, Pid: 2147480000},
		{Protocol: ProtocolTCP, Address: "bogus", Port: 4001, Status: tcpListenState, Pid: 1},
	})
	if len(services) != 1 {
		t.Fatalf("expected duplicate and invalid rows removed, got %d", len(services))
	}
	if services[0].Identity != IdentityUnavailable || services[0].ProcessName != "" {
		t.Errorf("expected unavailable identity, got %+v", services[0])
	}
}
