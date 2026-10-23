// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wcore

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
)

func TestTerminalWindowTransfer(t *testing.T) {
	// WStore owns a process-global connection. Run its fixture in a child so
	// Windows releases SQLite handles before the parent removes the temp folder.
	dataDir := os.Getenv("LASP_TRANSFER_TEST_DIR")
	if dataDir == "" {
		cmd := exec.Command(os.Args[0], "-test.run=^TestTerminalWindowTransfer$", "-test.v")
		cmd.Env = append(os.Environ(), "LASP_TRANSFER_TEST_DIR="+t.TempDir())
		output, err := cmd.CombinedOutput()
		t.Log(string(output))
		if err != nil {
			t.Fatal(err)
		}
		return
	}
	laspbase.DataHome_VarCache = dataDir
	if err := os.MkdirAll(filepath.Join(laspbase.DataHome_VarCache, "db"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := wstore.InitWStore(); err != nil {
		t.Fatal(err)
	}
	fixture := func(t *testing.T) (context.Context, *laspobj.Block, *laspobj.Tab, *laspobj.Tab, *laspobj.Window) {
		ctx := laspobj.ContextWithUpdates(context.Background())
		source := &laspobj.Tab{OID: uuid.NewString(), Name: "Source", LayoutState: uuid.NewString()}
		target := &laspobj.Tab{OID: uuid.NewString(), Name: "Destination", LayoutState: uuid.NewString()}
		workspace := &laspobj.Workspace{OID: uuid.NewString(), Name: "Second monitor", TabIds: []string{target.OID}, ActiveTabId: target.OID}
		win := &laspobj.Window{OID: uuid.NewString(), WorkspaceId: workspace.OID}
		block := &laspobj.Block{OID: uuid.NewString(), ParentORef: laspobj.MakeORef(laspobj.OType_Tab, source.OID).String(), Meta: laspobj.MetaMapType{"view": "term", "controller": "shell", "cmd:cwd": "C:/test"}}
		source.BlockIds = []string{block.OID}
		for _, obj := range []laspobj.LaspObj{source, target, workspace, win, block,
			&laspobj.LayoutState{OID: source.LayoutState}, &laspobj.LayoutState{OID: target.LayoutState}} {
			if err := wstore.DBInsert(ctx, obj); err != nil {
				t.Fatal(err)
			}
		}
		return laspobj.ContextWithUpdates(context.Background()), block, source, target, win
	}
	t.Run("move retains widget identity and queues non-destructive detach", func(t *testing.T) {
		ctx, block, source, target, win := fixture(t)
		if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, win.OID, target.OID); err != nil {
			t.Fatal(err)
		}
		got, err := wstore.DBMustGet[*laspobj.Block](ctx, block.OID)
		if err != nil {
			t.Fatal(err)
		}
		if got.ParentORef != laspobj.MakeORef(laspobj.OType_Tab, target.OID).String() || got.Meta["cmd:cwd"] != "C:/test" {
			t.Fatal("identity/state changed")
		}
		src, _ := wstore.DBMustGet[*laspobj.Tab](ctx, source.OID)
		dst, _ := wstore.DBMustGet[*laspobj.Tab](ctx, target.OID)
		if slices.Contains(src.BlockIds, block.OID) || !slices.Contains(dst.BlockIds, block.OID) {
			t.Fatal("incorrect ownership")
		}
		layout, _ := wstore.DBMustGet[*laspobj.LayoutState](ctx, source.LayoutState)
		if layout.PendingBackendActions == nil || (*layout.PendingBackendActions)[0].ActionType != "detach" {
			t.Fatal("must detach, not delete")
		}
		if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, win.OID, target.OID); err == nil {
			t.Fatal("stale duplicate move accepted")
		}
	})
	t.Run("extension widget moves with its id", func(t *testing.T) {
		ctx, block, source, target, win := fixture(t)
		block.Meta["view"] = "extwidget"
		block.Meta["ext:id"] = "network-globe"
		if err := wstore.DBUpdate(ctx, block); err != nil {
			t.Fatal(err)
		}
		if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, win.OID, target.OID); err != nil {
			t.Fatal(err)
		}
		got, _ := wstore.DBMustGet[*laspobj.Block](ctx, block.OID)
		if got.ParentORef != laspobj.MakeORef(laspobj.OType_Tab, target.OID).String() || got.Meta["ext:id"] != "network-globe" {
			t.Fatal("extension widget not moved intact")
		}
	})
	for _, scenario := range []string{"closed window", "changed tab", "unsupported widget", "transaction failure"} {
		t.Run(scenario, func(t *testing.T) {
			ctx, block, source, target, win := fixture(t)
			windowId, tabId := win.OID, target.OID
			switch scenario {
			case "closed window":
				windowId = uuid.NewString()
			case "changed tab":
				tabId = uuid.NewString()
			case "unsupported widget":
				block.Meta["view"] = "web"
				if err := wstore.DBUpdate(ctx, block); err != nil {
					t.Fatal(err)
				}
			case "transaction failure":
				if err := wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
					tx.Exec(fmt.Sprintf("CREATE TRIGGER fail_transfer BEFORE UPDATE ON db_layout WHEN OLD.oid = '%s' BEGIN SELECT RAISE(ABORT, 'forced layout failure'); END", target.LayoutState))
					return nil
				}); err != nil {
					t.Fatal(err)
				}
				defer wstore.WithTx(ctx, func(tx *wstore.TxWrap) error { tx.Exec("DROP TRIGGER fail_transfer"); return nil })
			}
			ctx = laspobj.ContextWithUpdates(context.Background())
			if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, windowId, tabId); err == nil {
				t.Fatal("invalid move accepted")
			}
			got, _ := wstore.DBMustGet[*laspobj.Block](ctx, block.OID)
			src, _ := wstore.DBMustGet[*laspobj.Tab](ctx, source.OID)
			dst, _ := wstore.DBMustGet[*laspobj.Tab](ctx, target.OID)
			if got.ParentORef != block.ParentORef || !slices.Contains(src.BlockIds, block.OID) || slices.Contains(dst.BlockIds, block.OID) {
				t.Fatal("failed transfer changed ownership")
			}
			if len(laspobj.ContextGetUpdatesRtn(ctx)) != 0 {
				t.Fatal("failed transfer published changes")
			}
		})
	}
}
