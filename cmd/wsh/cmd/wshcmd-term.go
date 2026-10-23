// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc/wshclient"
)

var termMagnified bool

var termCmd = &cobra.Command{
	Use:     "term",
	Short:   "open a terminal in directory",
	Args:    cobra.RangeArgs(0, 1),
	RunE:    termRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	termCmd.Flags().BoolVarP(&termMagnified, "magnified", "m", false, "open view in magnified mode")
	rootCmd.AddCommand(termCmd)
}

func termRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("term", rtnErr == nil)
	}()

	var cwd string
	if len(args) > 0 {
		cwd = args[0]
		cwdExpanded, err := laspbase.ExpandHomeDir(cwd)
		if err != nil {
			return err
		}
		cwd = cwdExpanded
	} else {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return fmt.Errorf("getting current directory: %w", err)
		}
	}
	var err error
	cwd, err = filepath.Abs(cwd)
	if err != nil {
		return fmt.Errorf("getting absolute path: %w", err)
	}

	tabId := getTabIdFromEnv()
	if tabId == "" {
		return fmt.Errorf("no LASPTERM_TABID env var set")
	}

	createMeta := map[string]any{
		laspobj.MetaKey_View:       "term",
		laspobj.MetaKey_CmdCwd:     cwd,
		laspobj.MetaKey_Controller: "shell",
	}
	if RpcContext.Conn != "" {
		createMeta[laspobj.MetaKey_Connection] = RpcContext.Conn
	}
	createBlockData := wshrpc.CommandCreateBlockData{
		TabId: tabId,
		BlockDef: &laspobj.BlockDef{
			Meta: createMeta,
		},
		Magnified: termMagnified,
		Focused:   true,
	}
	oref, err := wshclient.CreateBlockCommand(RpcClient, createBlockData, nil)
	if err != nil {
		return fmt.Errorf("creating new terminal block: %w", err)
	}
	WriteStdout("terminal block created: %s\n", oref)
	return nil
}
