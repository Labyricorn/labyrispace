// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc/wshclient"
)

var distroName string

var wslCmd = &cobra.Command{
	Use:     "wsl [-d <distribution-name>]",
	Short:   "connect this terminal to a local wsl connection",
	Args:    cobra.NoArgs,
	RunE:    wslRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	wslCmd.Flags().StringVarP(&distroName, "distribution", "d", "", "Run the specified distribution")
	rootCmd.AddCommand(wslCmd)
}

func wslRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("wsl", rtnErr == nil)
	}()

	var err error
	if distroName == "" {
		// get default distro from the host
		distroName, err = wshclient.WslDefaultDistroCommand(RpcClient, nil)
		if err != nil {
			return err
		}
	}
	if !strings.HasPrefix(distroName, "wsl://") {
		distroName = "wsl://" + distroName
	}
	blockId := RpcContext.BlockId
	if blockId == "" {
		return fmt.Errorf("cannot determine blockid (not in JWT)")
	}
	data := wshrpc.CommandSetMetaData{
		ORef: laspobj.MakeORef(laspobj.OType_Block, blockId),
		Meta: map[string]any{
			laspobj.MetaKey_Connection: distroName,
		},
	}
	err = wshclient.SetMetaCommand(RpcClient, data, nil)
	if err != nil {
		return fmt.Errorf("setting connection in block: %w", err)
	}
	WriteStderr("switched connection to %q\n", distroName)
	return nil
}
