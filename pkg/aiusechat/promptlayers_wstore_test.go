// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
	"github.com/google/uuid"
)

type wstoreFixture struct {
	ctx context.Context
	t   *testing.T
}

// The wstore database is a process-wide singleton that cannot be closed, so its directory is
// removed best-effort (Windows keeps the open file locked).
func setupWstoreFixture(t *testing.T) *wstoreFixture {
	t.Helper()
	dataDir, err := os.MkdirTemp("", "lasp-promptlayers-test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dataDir) })
	if err := os.MkdirAll(filepath.Join(dataDir, laspbase.LaspDBDir), 0o755); err != nil {
		t.Fatal(err)
	}
	laspbase.DataHome_VarCache = dataDir
	if err := wstore.InitWStore(); err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skip("sqlite needs cgo; run with CGO_ENABLED=1")
		}
		t.Fatalf("InitWStore: %v", err)
	}
	return &wstoreFixture{ctx: laspobj.ContextWithUpdates(context.Background()), t: t}
}

type testBlock struct {
	connection string
	cwd        string
	liveCwd    bool
	view       string
}

func (f *wstoreFixture) addTab(blocks ...testBlock) (string, []string) {
	f.t.Helper()
	tab := &laspobj.Tab{OID: uuid.NewString(), Name: "test"}
	for _, b := range blocks {
		meta := laspobj.MetaMapType{"view": "term", "cmd:cwd": b.cwd}
		if b.view != "" {
			meta["view"] = b.view
		}
		if b.connection != "" {
			meta["connection"] = b.connection
		}
		block := &laspobj.Block{OID: uuid.NewString(), Meta: meta}
		if err := wstore.DBInsert(f.ctx, block); err != nil {
			f.t.Fatal(err)
		}
		wstore.SetRTInfo(laspobj.MakeORef(laspobj.OType_Block, block.OID), map[string]any{"shell:hascurcwd": b.liveCwd})
		tab.BlockIds = append(tab.BlockIds, block.OID)
	}
	if err := wstore.DBInsert(f.ctx, tab); err != nil {
		f.t.Fatal(err)
	}
	return tab.OID, tab.BlockIds
}

func makeProjectDir(t *testing.T, instructions string) string {
	t.Helper()
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "AGENTS.md"), instructions)
	return dir
}

func TestChatSystemPromptWithRealTab(t *testing.T) {
	f := setupWstoreFixture(t)
	dirA := makeProjectDir(t, "RULES-FOR-A")
	dirB := makeProjectDir(t, "RULES-FOR-B")
	dirC := makeProjectDir(t, "RULES-FOR-C")
	dirRemote := makeProjectDir(t, "RULES-FOR-REMOTE")
	dirNoLive := makeProjectDir(t, "RULES-FOR-NOLIVE")
	dirWeb := makeProjectDir(t, "RULES-FOR-WEB")

	tabId, blockIds := f.addTab(
		testBlock{cwd: dirRemote, connection: "ssh://box", liveCwd: true},
		testBlock{cwd: dirNoLive, liveCwd: false},
		testBlock{cwd: dirWeb, liveCwd: true, view: "web"},
		testBlock{cwd: dirA, liveCwd: true},
		testBlock{cwd: dirB, liveCwd: true},
	)
	_, otherTabBlocks := f.addTab(testBlock{cwd: dirC, liveCwd: true})
	blockB := blockIds[4]

	configDir := t.TempDir()
	writeTestFile(t, filepath.Join(configDir, PersonaFileName), "PERSONA-TEXT")
	cfg := &uctypes.AIOptsType{APIType: uctypes.APIType_OpenAIChat, Model: "m", Capabilities: []string{uctypes.AICapabilityTools}}
	layerOpts := contextLayerOpts{ConfigDir: configDir, Persona: true, ProjectContext: true}
	build := func(req PostMessageRequest, opts contextLayerOpts, cfg *uctypes.AIOptsType) string {
		return strings.Join(makeChatSystemPrompt(f.ctx, cfg, req, opts), "\n\n")
	}
	req := PostMessageRequest{TabId: tabId, WidgetAccess: true}

	t.Run("skips remote, stale, and non-terminal blocks and uses tab order", func(t *testing.T) {
		got := build(req, layerOpts, cfg)
		if !strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("expected the first usable terminal (A):\n%s", got)
		}
		for _, bad := range []string{"RULES-FOR-REMOTE", "RULES-FOR-NOLIVE", "RULES-FOR-WEB", "RULES-FOR-B"} {
			if strings.Contains(got, bad) {
				t.Fatalf("%s must not be loaded", bad)
			}
		}
	})

	t.Run("focused block wins", func(t *testing.T) {
		focused := req
		focused.FocusedBlockId = blockB
		got := build(focused, layerOpts, cfg)
		if !strings.Contains(got, "RULES-FOR-B") || strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("expected B only:\n%s", got)
		}
	})

	t.Run("focused block from another tab is ignored", func(t *testing.T) {
		foreign := req
		foreign.FocusedBlockId = otherTabBlocks[0]
		got := build(foreign, layerOpts, cfg)
		if strings.Contains(got, "RULES-FOR-C") || !strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("a block outside the tab must not be used:\n%s", got)
		}
	})

	t.Run("focused remote block falls back to a local terminal", func(t *testing.T) {
		remote := req
		remote.FocusedBlockId = blockIds[0]
		got := build(remote, layerOpts, cfg)
		if strings.Contains(got, "RULES-FOR-REMOTE") || !strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("remote terminals must never be read:\n%s", got)
		}
	})

	t.Run("layers appear in order after the base prompt", func(t *testing.T) {
		got := build(req, layerOpts, cfg)
		base := strings.Index(got, "Labyrispace")
		persona := strings.Index(got, "PERSONA-TEXT")
		project := strings.Index(got, "RULES-FOR-A")
		if base < 0 || persona < base || project < persona {
			t.Fatalf("unexpected order base=%d persona=%d project=%d", base, persona, project)
		}
	})

	t.Run("no project layer without widget access", func(t *testing.T) {
		noAccess := req
		noAccess.WidgetAccess = false
		got := build(noAccess, layerOpts, cfg)
		if strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("project files must not be read without widget access:\n%s", got)
		}
		if !strings.Contains(got, "PERSONA-TEXT") {
			t.Fatal("persona should not depend on widget access")
		}
	})

	t.Run("settings can turn each layer off", func(t *testing.T) {
		got := build(req, contextLayerOpts{ConfigDir: configDir}, cfg)
		if strings.Contains(got, "PERSONA-TEXT") || strings.Contains(got, "RULES-FOR-A") {
			t.Fatalf("disabled layers leaked:\n%s", got)
		}
	})

	t.Run("builder mode gets no layers", func(t *testing.T) {
		builder := req
		builder.BuilderId = "builder1"
		if got := makeChatSystemPrompt(f.ctx, cfg, builder, layerOpts); len(got) != 0 {
			t.Fatalf("builder prompt must stay empty: %v", got)
		}
	})

	t.Run("external agent gets its short prompt plus layers", func(t *testing.T) {
		external := &uctypes.AIOptsType{APIType: uctypes.APIType_OpenAIChat, Model: "hermes-agent", Capabilities: []string{uctypes.AICapabilityExternalTools}}
		got := build(req, layerOpts, external)
		if !strings.Contains(got, "Use your own tools and abilities") || !strings.Contains(got, "RULES-FOR-A") || !strings.Contains(got, "PERSONA-TEXT") {
			t.Fatalf("unexpected external agent prompt:\n%s", got)
		}
		if strings.Contains(got, "NO API access") {
			t.Fatal("external agents must not be told they lack abilities")
		}
	})

	t.Run("unknown tab yields only persona", func(t *testing.T) {
		missing := PostMessageRequest{TabId: uuid.NewString(), WidgetAccess: true}
		got := build(missing, layerOpts, cfg)
		if strings.Contains(got, "RULES-FOR") || !strings.Contains(got, "PERSONA-TEXT") {
			t.Fatalf("unexpected prompt for a missing tab:\n%s", got)
		}
	})
}
