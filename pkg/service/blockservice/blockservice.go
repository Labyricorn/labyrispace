// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: terminal transfer between windows.

package blockservice

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/Labyricorn/labyrispace/pkg/blockcontroller"
	"github.com/Labyricorn/labyrispace/pkg/filestore"
	"github.com/Labyricorn/labyrispace/pkg/tsgen/tsgenmeta"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wcore"
	"github.com/Labyricorn/labyrispace/pkg/wps"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
)

type BlockService struct{}

const DefaultTimeout = 2 * time.Second

var BlockServiceInstance = &BlockService{}

func (bs *BlockService) ListTerminalMoveTargets(ctx context.Context, sourceTabId string) ([]wcore.TerminalMoveTarget, error) {
	return wcore.ListTerminalMoveTargets(ctx, sourceTabId)
}

func (bs *BlockService) MoveTerminalToWindow(ctx context.Context, blockId, sourceTabId, targetWindowId, targetTabId string) (laspobj.UpdatesRtnType, error) {
	ctx = laspobj.ContextWithUpdates(ctx)
	if err := wcore.MoveTerminalBlockToWindow(ctx, blockId, sourceTabId, targetWindowId, targetTabId); err != nil {
		return nil, err
	}
	updates := laspobj.ContextGetUpdatesRtn(ctx)
	wps.Broker.SendUpdateEvents(updates)
	return updates, nil
}

func (bs *BlockService) SendCommand_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		Desc:     "send command to block",
		ArgNames: []string{"blockid", "cmd"},
	}
}

func (bs *BlockService) GetControllerStatus(ctx context.Context, blockId string) (*blockcontroller.BlockControllerRuntimeStatus, error) {
	return blockcontroller.GetBlockControllerRuntimeStatus(blockId), nil
}

func (*BlockService) SaveTerminalState_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		Desc:     "save the terminal state to a blockfile",
		ArgNames: []string{"ctx", "blockId", "state", "stateType", "ptyOffset", "termSize"},
	}
}

func (bs *BlockService) SaveTerminalState(ctx context.Context, blockId string, state string, stateType string, ptyOffset int64, termSize laspobj.TermSize) error {
	_, err := wstore.DBMustGet[*laspobj.Block](ctx, blockId)
	if err != nil {
		return err
	}
	if stateType != "full" && stateType != "preview" {
		return fmt.Errorf("invalid state type: %q", stateType)
	}
	// ignore MakeFile error (already exists is ok)
	filestore.WFS.MakeFile(ctx, blockId, "cache:term:"+stateType, nil, wshrpc.FileOpts{})
	err = filestore.WFS.WriteFile(ctx, blockId, "cache:term:"+stateType, []byte(state))
	if err != nil {
		return fmt.Errorf("cannot save terminal state: %w", err)
	}
	fileMeta := wshrpc.FileMeta{
		"ptyoffset": ptyOffset,
		"termsize":  termSize,
	}
	err = filestore.WFS.WriteMeta(ctx, blockId, "cache:term:"+stateType, fileMeta, true)
	if err != nil {
		return fmt.Errorf("cannot save terminal state meta: %w", err)
	}
	return nil
}

func (*BlockService) CleanupOrphanedBlocks_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		Desc:     "queue a layout action to cleanup orphaned blocks in the tab",
		ArgNames: []string{"ctx", "tabId"},
	}
}

func (bs *BlockService) CleanupOrphanedBlocks(ctx context.Context, tabId string) (laspobj.UpdatesRtnType, error) {
	ctx = laspobj.ContextWithUpdates(ctx)
	layoutAction := laspobj.LayoutActionData{
		ActionType: wcore.LayoutActionDataType_CleanupOrphaned,
		ActionId:   uuid.NewString(),
	}
	err := wcore.QueueLayoutActionForTab(ctx, tabId, layoutAction)
	if err != nil {
		return nil, fmt.Errorf("error queuing cleanup layout action: %w", err)
	}
	return laspobj.ContextGetUpdatesRtn(ctx), nil
}
