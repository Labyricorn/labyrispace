// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

//go:build windows

package localservices

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// The process snapshot lists every image name without needing rights to open each process.
func snapshotNames() map[int32]string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snap, &entry); err != nil {
		return nil
	}
	names := make(map[int32]string)
	for {
		names[int32(entry.ProcessID)] = windows.UTF16ToString(entry.ExeFile[:])
		if err := windows.Process32Next(snap, &entry); err != nil {
			break
		}
	}
	return names
}
