// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package build

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyFileAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "go.mod")
	dest := filepath.Join(dir, "out", "go.mod")
	if err := os.WriteFile(src, []byte("module x\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := copyFile(src, dest); err != nil {
		t.Fatalf("copyFile failed: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil || string(got) != "module x\n" {
		t.Fatalf("unexpected copy result %q %v", got, err)
	}
}
