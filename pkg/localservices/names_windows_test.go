// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

//go:build windows

package localservices

import (
	"os"
	"testing"
)

func TestSnapshotNamesIncludesOwnProcess(t *testing.T) {
	names := snapshotNames()
	if names[int32(os.Getpid())] == "" {
		t.Fatalf("expected an image name for pid %d", os.Getpid())
	}
}
