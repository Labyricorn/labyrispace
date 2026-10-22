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
	"github.com/wavetermdev/waveterm/pkg/wavebase"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

func TestTerminalWindowTransfer(t *testing.T) {
	// WStore owns a process-global connection. Run its fixture in a child so
	// Windows releases SQLite handles before the parent removes the temp folder.
	dataDir := os.Getenv("WAVE_TRANSFER_TEST_DIR")
	if dataDir == "" {
		cmd := exec.Command(os.Args[0], "-test.run=^TestTerminalWindowTransfer$", "-test.v")
		cmd.Env = append(os.Environ(), "WAVE_TRANSFER_TEST_DIR="+t.TempDir())
		output, err := cmd.CombinedOutput()
		t.Log(string(output))
		if err != nil {
			t.Fatal(err)
		}
		return
	}
	wavebase.DataHome_VarCache = dataDir
	if err := os.MkdirAll(filepath.Join(wavebase.DataHome_VarCache, "db"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := wstore.InitWStore(); err != nil {
		t.Fatal(err)
	}
	fixture := func(t *testing.T) (context.Context, *waveobj.Block, *waveobj.Tab, *waveobj.Tab, *waveobj.Window) {
		ctx := waveobj.ContextWithUpdates(context.Background())
		source := &waveobj.Tab{OID: uuid.NewString(), Name: "Source", LayoutState: uuid.NewString()}
		target := &waveobj.Tab{OID: uuid.NewString(), Name: "Destination", LayoutState: uuid.NewString()}
		workspace := &waveobj.Workspace{OID: uuid.NewString(), Name: "Second monitor", TabIds: []string{target.OID}, ActiveTabId: target.OID}
		win := &waveobj.Window{OID: uuid.NewString(), WorkspaceId: workspace.OID}
		block := &waveobj.Block{OID: uuid.NewString(), ParentORef: waveobj.MakeORef(waveobj.OType_Tab, source.OID).String(), Meta: waveobj.MetaMapType{"view": "term", "controller": "shell", "cmd:cwd": "C:/test"}}
		source.BlockIds = []string{block.OID}
		for _, obj := range []waveobj.WaveObj{source, target, workspace, win, block,
			&waveobj.LayoutState{OID: source.LayoutState}, &waveobj.LayoutState{OID: target.LayoutState}} {
			if err := wstore.DBInsert(ctx, obj); err != nil {
				t.Fatal(err)
			}
		}
		return waveobj.ContextWithUpdates(context.Background()), block, source, target, win
	}
	t.Run("move retains widget identity and queues non-destructive detach", func(t *testing.T) {
		ctx, block, source, target, win := fixture(t)
		if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, win.OID, target.OID); err != nil {
			t.Fatal(err)
		}
		got, err := wstore.DBMustGet[*waveobj.Block](ctx, block.OID)
		if err != nil {
			t.Fatal(err)
		}
		if got.ParentORef != waveobj.MakeORef(waveobj.OType_Tab, target.OID).String() || got.Meta["cmd:cwd"] != "C:/test" {
			t.Fatal("identity/state changed")
		}
		src, _ := wstore.DBMustGet[*waveobj.Tab](ctx, source.OID)
		dst, _ := wstore.DBMustGet[*waveobj.Tab](ctx, target.OID)
		if slices.Contains(src.BlockIds, block.OID) || !slices.Contains(dst.BlockIds, block.OID) {
			t.Fatal("incorrect ownership")
		}
		layout, _ := wstore.DBMustGet[*waveobj.LayoutState](ctx, source.LayoutState)
		if layout.PendingBackendActions == nil || (*layout.PendingBackendActions)[0].ActionType != "detach" {
			t.Fatal("must detach, not delete")
		}
		if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, win.OID, target.OID); err == nil {
			t.Fatal("stale duplicate move accepted")
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
				block.Meta["view"] = "preview"
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
			ctx = waveobj.ContextWithUpdates(context.Background())
			if err := MoveTerminalBlockToWindow(ctx, block.OID, source.OID, windowId, tabId); err == nil {
				t.Fatal("invalid move accepted")
			}
			got, _ := wstore.DBMustGet[*waveobj.Block](ctx, block.OID)
			src, _ := wstore.DBMustGet[*waveobj.Tab](ctx, source.OID)
			dst, _ := wstore.DBMustGet[*waveobj.Tab](ctx, target.OID)
			if got.ParentORef != block.ParentORef || !slices.Contains(src.BlockIds, block.OID) || slices.Contains(dst.BlockIds, block.OID) {
				t.Fatal("failed transfer changed ownership")
			}
			if len(waveobj.ContextGetUpdatesRtn(ctx)) != 0 {
				t.Fatal("failed transfer published changes")
			}
		})
	}
}
