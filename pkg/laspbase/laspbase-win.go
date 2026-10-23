// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

//go:build windows

package laspbase

import (
	"fmt"
	"log"
	"path/filepath"

	"github.com/alexflint/go-filemutex"
)

func AcquireLaspLock() (FDLock, error) {
	dataHomeDir := GetLaspDataDir()
	lockFileName := filepath.Join(dataHomeDir, LaspLockFile)
	log.Printf("[base] acquiring lock on %s\n", lockFileName)
	m, err := filemutex.New(lockFileName)
	if err != nil {
		return nil, fmt.Errorf("filemutex new error: %w", err)
	}
	err = m.TryLock()
	if err != nil {
		return nil, fmt.Errorf("filemutex trylock error: %w", err)
	}
	return m, nil
}
