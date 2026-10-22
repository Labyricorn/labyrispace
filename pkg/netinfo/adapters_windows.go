// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

//go:build windows

package netinfo

import (
	"errors"
	"net/netip"
	"unsafe"

	"golang.org/x/sys/windows"
)

const adapterBufferStart = 15 * 1024

func gatewayAddress(sa *windows.SocketAddress) string {
	if sa == nil || sa.Sockaddr == nil {
		return ""
	}
	raw := (*windows.RawSockaddrAny)(unsafe.Pointer(sa.Sockaddr))
	addr, err := raw.Sockaddr()
	if err != nil {
		return ""
	}
	switch a := addr.(type) {
	case *windows.SockaddrInet4:
		return netip.AddrFrom4(a.Addr).String()
	case *windows.SockaddrInet6:
		return netip.AddrFrom16(a.Addr).Unmap().String()
	}
	return ""
}

func platformAdapters() ([]adapterInfo, error) {
	size := uint32(adapterBufferStart)
	var buf []byte
	for attempt := 0; ; attempt++ {
		buf = make([]byte, size)
		first := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0]))
		err := windows.GetAdaptersAddresses(windows.AF_UNSPEC, windows.GAA_FLAG_INCLUDE_GATEWAYS, 0, first, &size)
		if err == nil {
			break
		}
		if !errors.Is(err, windows.ERROR_BUFFER_OVERFLOW) || attempt >= 3 {
			return nil, err
		}
	}
	var adapters []adapterInfo
	for a := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0])); a != nil; a = a.Next {
		info := adapterInfo{
			Name:        windows.UTF16PtrToString(a.FriendlyName),
			Description: windows.UTF16PtrToString(a.Description),
			Up:          a.OperStatus == windows.IfOperStatusUp,
			Loopback:    a.IfType == windows.IF_TYPE_SOFTWARE_LOOPBACK,
			Metric:      a.Ipv4Metric,
		}
		if info.Metric == 0 {
			info.Metric = a.Ipv6Metric
		}
		for g := a.FirstGatewayAddress; g != nil; g = g.Next {
			if addr := gatewayAddress(&g.Address); addr != "" {
				info.Gateways = append(info.Gateways, addr)
			}
		}
		adapters = append(adapters, info)
	}
	return adapters, nil
}
