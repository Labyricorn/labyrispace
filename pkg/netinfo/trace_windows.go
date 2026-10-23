// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

package netinfo

import (
	"os/exec"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
