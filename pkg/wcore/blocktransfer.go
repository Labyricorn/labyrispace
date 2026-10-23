// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wcore

import (
	"context"
	"fmt"
	"slices"

	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
)

var MovableViews = []string{"term", "extwidget", "preview"}

type TerminalMoveTarget struct {
	WindowId string `json:"windowid"`
	TabId    string `json:"tabid"`
	Label    string `json:"label"`
}

func ListTerminalMoveTargets(ctx context.Context, sourceTabId string) ([]TerminalMoveTarget, error) {
	windows, err := wstore.DBGetAllObjsByType[*laspobj.Window](ctx, laspobj.OType_Window)
	if err != nil {
		return nil, err
	}
	targets := make([]TerminalMoveTarget, 0)
	for _, win := range windows {
		workspace, err := wstore.DBMustGet[*laspobj.Workspace](ctx, win.WorkspaceId)
		if err != nil || workspace.ActiveTabId == "" || slices.Contains(workspace.TabIds, sourceTabId) {
			continue
		}
		tab, err := wstore.DBMustGet[*laspobj.Tab](ctx, workspace.ActiveTabId)
		if err != nil {
			continue
		}
		name := workspace.Name
		if name == "" {
			name = "Unsaved workspace"
		}
		targets = append(targets, TerminalMoveTarget{WindowId: win.OID, TabId: tab.OID,
			Label: fmt.Sprintf("%s / %s (%s)", name, tab.Name, win.OID[:8])})
	}
	return targets, nil
}

// Transfer ownership and queue both layout changes in one transaction. Do not
// delete the block or stop its controller: its identity owns the running shell.
func MoveTerminalBlockToWindow(ctx context.Context, blockId, sourceTabId, targetWindowId, targetTabId string) error {
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		ctx := tx.Context()
		block, err := wstore.DBMustGet[*laspobj.Block](ctx, blockId)
		if err != nil {
			return err
		}
		if !slices.Contains(MovableViews, block.Meta.GetString(laspobj.MetaKey_View, "")) {
			return fmt.Errorf("this block type cannot be moved to another window")
		}
		if block.ParentORef != laspobj.MakeORef(laspobj.OType_Tab, sourceTabId).String() {
			return fmt.Errorf("terminal is no longer in the source tab")
		}
		source, err := wstore.DBMustGet[*laspobj.Tab](ctx, sourceTabId)
		if err != nil {
			return err
		}
		if !slices.Contains(source.BlockIds, blockId) {
			return fmt.Errorf("source tab does not own terminal")
		}
		win, err := wstore.DBMustGet[*laspobj.Window](ctx, targetWindowId)
		if err != nil {
			return fmt.Errorf("destination window is no longer available: %w", err)
		}
		workspace, err := wstore.DBMustGet[*laspobj.Workspace](ctx, win.WorkspaceId)
		if err != nil {
			return err
		}
		if slices.Contains(workspace.TabIds, sourceTabId) {
			return fmt.Errorf("choose another window")
		}
		if workspace.ActiveTabId != targetTabId || !slices.Contains(workspace.TabIds, targetTabId) {
			return fmt.Errorf("destination tab changed; reopen the move menu")
		}
		target, err := wstore.DBMustGet[*laspobj.Tab](ctx, targetTabId)
		if err != nil {
			return err
		}
		if slices.Contains(target.BlockIds, blockId) {
			return fmt.Errorf("destination already contains terminal")
		}
		// Validate layouts before any ownership writes, including closed/corrupt destinations.
		if _, err := wstore.DBMustGet[*laspobj.LayoutState](ctx, source.LayoutState); err != nil {
			return err
		}
		if _, err := wstore.DBMustGet[*laspobj.LayoutState](ctx, target.LayoutState); err != nil {
			return err
		}
		source.BlockIds = slices.DeleteFunc(source.BlockIds, func(id string) bool { return id == blockId })
		target.BlockIds = append(target.BlockIds, blockId)
		block.ParentORef = laspobj.MakeORef(laspobj.OType_Tab, targetTabId).String()
		for _, obj := range []laspobj.LaspObj{source, target, block} {
			if err := wstore.DBUpdate(ctx, obj); err != nil {
				return err
			}
		}
		if err := QueueLayoutActionForTab(ctx, sourceTabId, laspobj.LayoutActionData{
			ActionType: "detach", BlockId: blockId,
		}); err != nil {
			return err
		}
		return QueueLayoutActionForTab(ctx, targetTabId, laspobj.LayoutActionData{
			ActionType: LayoutActionDataType_Insert, BlockId: blockId, Focused: true,
		})
	})
}
