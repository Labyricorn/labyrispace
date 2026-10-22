# Phase 1 inventory, baseline, and audits

Baseline commit `087f453` (source identical to `6228452`). Source inspection only; no runtime capture was done in this phase, so nothing here claims network silence. Classification: active, disabled, dev-only, historical, attribution.

## 1. Identity and packaging

| Item | Location | Class | Replacement (Phase 2) |
|---|---|---|---|
| npm name `waveterm`, productName `Wave`, author `Command Line Inc`, homepage `waveterm.dev`, description "AI-Native Terminal" | `package.json:2-9` | active | Labyrispace name, Labyricorn author, local homepage, new description |
| appId `dev.commandline.waveterm` | `package.json:13`, `electron-builder.config.cjs:14` | active | new app ID; profile import button (decision 5c) |
| Windows publisher/signing subject `Command Line Inc` | `electron-builder.config.cjs` (win.signtoolOptions) | active, only if signing env var set | Labyricorn identity; no signing credentials exist |
| macOS usage strings "...running in Wave..." | `electron-builder.config.cjs` mac.extendInfo | active but out of scope (Windows-first) | leave, untested |
| Electron app name `Wave` / `Wave (Dev)`, userData name `waveterm/electron` | `emain/emain-platform.ts:19,37` | active | rename with app ID; affects userData path, so tie to import |
| Config/data env vars `WAVETERM_CONFIG_HOME`, `WAVETERM_DATA_HOME`, `WAVETERM_HOME`, `WAVETERM_AUTH_KEY`, `WAVETERM_APP_PATH` etc. | `emain/emain-platform.ts`, `emain/authkey.ts`, `emain/emain-util.ts` | active, internal | retain (compat list) |
| Menu "About Wave Terminal", quit dialog "quit Wave Terminal", performance dialog "Wave has detected..." | `emain/emain-menu.ts:178`, `emain/emain.ts:285`, `emain/emain-platform.ts:52` | active | rename |
| Frontend visible "Wave" strings | 83 files, ~194 matches under `frontend/` (AI panel, config, onboarding, about, tips) | active | rename; preview fixtures dev-only |
| Go user-facing text: AI system prompts say "Wave AI ... Wave Terminal"; `wsh` help text says "Wave Terminal" | `pkg/aiusechat/usechat-prompts.go:9,47,80`, `cmd/wsh/cmd/*.go` | active | rename AI prompt to AI Assistant; `wsh` text rename; `wsh` binary name retained |
| Go doc comments "WaveTerm" | `pkg/aiusechat/gemini/doc.go`, `google/doc.go` | historical | leave |
| JWT issuer `waveterm` | `pkg/wavejwt/wavejwt.go:18` | active, internal | retain |
| Artwork: `assets/wave-*.png/svg`, `assets/waveterm-logo-*`, `assets/appicon-windows.*`, `build/icon.ico`, `build/icon.icns`, `build/icons/`, `public/logos` | listed paths | active | replace from Phase 0 selection; `icon.icns` untouched |
| `README.upstream.md`, `LICENSE`, `NOTICE`, `ACKNOWLEDGEMENTS.md` | root | attribution | preserve |

## 2. Release and CI tooling (Phase 2, item 6)

| Item | Location | Class | Action |
|---|---|---|---|
| `RELEASES_BUCKET: dl.waveterm.dev/releases-w2` | `Taskfile.yml:15` | disabled in practice (no credentials) but present | retarget or remove |
| `artifacts:upload`, `artifacts:publish:*`, `artifacts:snap:publish:*`, `artifacts:winget:publish:*` (aws s3, snapcraft, wingetcreate) | `Taskfile.yml:373-426` | dev-only, inherited | disable or remove |
| Workflows referencing upstream namespace, S3, Winget, signing, Apple: `build-helper.yml`, `publish-release.yml`, `testdriver.yml` | `.github/workflows/` | inherited | review; do not run |
| `electron-builder` `publish: null`, updater removed | `electron-builder.config.cjs` | disabled (done in prior work) | none |
| Docusaurus site: Plausible script | `docs/docusaurus.config.ts:187` | active in docs build only | remove (Phase 3.6) |
| Docs build fetches Google Fonts | `docs/src/renderer/image-renderers.ts:120` | dev/build-time | bundle fonts locally |
| Upstream references in docs content (`docs.waveterm.dev` appears 14 times in app source) | `frontend/` and `pkg/` | active links, blocked at runtime by policy | replace with local help or omit |

## 3. Telemetry and bookkeeping

| Item | Location | Class |
|---|---|---|
| Electron one-minute activity timer: builds activity record, calls `RecordTEventCommand` and `ActivityCommand` RPCs, tracks terminal command counts (local/remote/WSL/durable) and AI active minutes | `emain/emain.ts` (~lines 128-230); `emain/emain-activity.ts` | **active** producer; backend persistence/upload disabled per `devlog.md` and `VENDOR-CONNECTIONS.md` |
| Backend telemetry/cloud/updater implementations | removed in prior commits | disabled |
| Compatibility RPC handlers (telemetry enable returns an error; others inert) | `pkg/wshrpc/wshserver` | disabled, inert |
| Backend policy: effective config forces telemetry/update/cloud off; Wave hosts denied by `pkg/vendorpolicy` | `pkg/vendorpolicy`, `pkg/wconfig` | active enforcement (retain) |

Phase 3 removes the Electron timer and producers after tracing shared consumers (the command-count atoms may also feed non-telemetry UI).

## 4. Network call sites found in source

Source-level only; ordering by count of references. Hosts in code are mostly documentation or provider links, not startup traffic.

| Host / mechanism | Where | Class |
|---|---|---|
| `https://<domain>/favicon.ico` fetched per bookmark; fallback `github.githubassets.com` favicon | `pkg/faviconcache/faviconcache.go:131-143`, used by `pkg/suggestion/suggestion.go:317` | **active**: remote fetch when suggestions render (Phase 3.3) |
| Search default Google | `frontend/app/view/webview` and config | active; replaced by first-run choice (Phase 2b) |
| AI provider endpoints (`api.openai.com`, `generativelanguage.googleapis.com`, `openrouter.ai`, `api.groq.com`, `nano-gpt.com`) | `pkg/aiusechat`, `pkg/wconfig` presets | active only when configured; first release supports OpenAI, Anthropic, LM Studio |
| `docs.waveterm.dev` links, `discord.gg` | frontend/pkg strings | links only; blocked or removed |
| Remote Markdown images, CSS backgrounds, custom resources | preview and `backgrounds.json` | active when content references remote URLs (Phase 3.4) |
| SSH/WSL connections | `pkg/remote`, `pkg/wslconn` | user-initiated |
| Tsunami: `go mod tidy`/build at runtime may need module downloads | `tsunami/build/build.go:420,761` | dev/runtime when Tsunami apps are built |
| Dependency/build traffic: npm, Go modules, Zig | build scripts | build-time, outside the application |

## 5. Audits

### 5.1 Listener and authentication

Verified in source:
- Backend HTTP and WebSocket bind **`127.0.0.1:` with an ephemeral port** (`pkg/web/web.go:421-423`). No non-loopback bind was found for the main servers.
- Every HTTP route registered through `WebFnWrap` validates `X-AuthKey` against a per-launch UUID (`pkg/authkey/authkey.go`, `pkg/web/web.go:411`); the WebSocket handler validates it too (`pkg/web/ws.go:258`). `OPTIONS` preflight bypasses auth by design.
- Exception: `/schema/` is served without authentication (`pkg/web/web.go` schema route). Static schema files; low sensitivity.
- Auth key is generated by Electron (`crypto.randomUUID()`), passed by environment, and the backend unsets the variable after reading (`authkey.go:33`). Comparison uses `!=`, not constant-time; negligible on loopback.
- Domain socket `wave.sock` is `chmod 0700` (`web.go:436`); on Windows `chmod` semantics are limited, so protection there is **unverified**.
- Debug pprof server: setting-gated (`debug:pprofport`), binds `localhost`, no auth (`cmd/server/main-server.go:355-375`). Off by default.
- Dev mode CORS reflects any `Origin` with credentials allowed (`web.go:470-486`). Dev only.

Finding to confirm, not yet demonstrated: Electron injects `X-AuthKey` into **every** request from the default session and tab sessions that targets the backend URL (`emain/authkey.ts:15-23`, applied to `defaultSession` at `emain/emain.ts:405`). Web widgets use `webview` with `partition` undefined unless metadata sets one (`frontend/app/view/webview/webview.tsx:865-867,1120`), which means they share the default session. A page loaded in a web widget that learns the ephemeral port could therefore issue requests to the backend with a valid key attached. Production mode sends no CORS allow headers, so reading responses is blocked, but "simple" cross-origin POSTs may still reach handlers. Needs a controlled test before any claim. This is outside the plan's pre-approved remediation (non-loopback bind, missing auth), so it is reported for decision at the checkpoint.

### 5.2 Secret store

- `pkg/secretstore/secretstore.go`: secrets are JSON encrypted via Electron `safeStorage` (OS-backed; DPAPI on Windows), stored in `secrets.enc` under the config directory with mode `0600`. Writes are debounced; secret names must match `^[A-Za-z][A-Za-z0-9_]*$`.
- On Linux a storage-backend probe runs; irrelevant for Windows-first.
- Wave-named items to rename in Phase 2b: file/command naming via `wsh secret` help text, internal key `wave:writets`. Retain internals; rename user-visible text.
- Suitable base for Phase 2b API keys. Open question for Phase 2b: confirm `safeStorage` is available at first run and define behavior when unavailable (refuse to store, do not fall back to plaintext).

### 5.3 Tsunami and widget facilities (decision input for Phase 4)

- Tsunami apps are Go programs built at runtime: the builder locates the `go` toolchain, runs `go mod tidy`, `go build`, plus a Node tailwind step (`tsunami/build/build.go:136,420,761,838`). That requires a Go toolchain and Node on the user's machine and may need module downloads.
- Built-in views register through `BlockRegistry` (`frontend/app/block/blockregistry.ts`) with a view model, and appear via `pkg/wconfig/defaultconfig/widgets.json`. A close precedent exists: `processviewer` (view + `RemoteProcessListCommand` RPC in `pkg/wshrpc/wshrpctypes.go:130,900-910`).
- **Recommendation: build Local Services as a built-in view modeled on `processviewer`** (new view type, registry entry, widget entry, one RPC for listener discovery). Do not use Tsunami: runtime Go/Node dependency and download risk conflict with the offline goal. The existing `processviewer` RPC can be a starting point for process identity.
- Constraint from `rules.md`: new RPCs go in `wshrpctypes.go`, followed by `task generate`; generated files are not hand-edited. Confirm `task` is available in the Windows toolchain before Phase 4.

## 6. Baseline tests

Command: `scripts/test-labyrispace.ps1` (Go packages vendorpolicy, wcloud, telemetry, wconfig, aiusechat, aiutil, clientservice, wshserver, wcore, blockservice; then vitest on layout, vendorpolicy and webview tests). Full TypeScript check has inherited preview-fixture errors (documented in `devlog.md`).

Result (exit 0): Go packages vendorpolicy (cached), wcloud, telemetry, wconfig (cached), aiusechat, aiutil, wcore pass; clientservice, wshserver and blockservice have no test files. Vitest: 5 files, 41 tests pass. The log lives in ignored `.local/phase1/`.

Build: `scripts/build-labyrispace.ps1` exits 0 (Windows backend, helper and Electron frontend; frontend built in 47s). Inherited warning: `vite-plugin-image-optimizer` cannot find `sharp`, so no image rasterizer is installed (relevant to `.ico` generation).

Not covered by this script: the full TypeScript check (inherited preview-fixture errors, unchanged), and any runtime or UI behavior.

## 7. Isolated test profiles

Not yet created. Plan: fresh profile and a hostile legacy-enabled profile under ignored `.local/`, using the existing `scripts/start-labyrispace.ps1` conventions. Deferred to the start of Phase 3 verification, since Phase 1 made no runtime changes and must not touch the real profile.

## 8. Decisions needed at the Phase 1 checkpoint

1. Web-widget `X-AuthKey` exposure (5.1): authorize a controlled reproduction and, if confirmed, a fix (for example give web widgets a dedicated partition, or restrict injection to the app's own origin).
2. Confirm Tsunami is not used for Local Services (5.3).
3. Choose a rasterizer for `.ico` and PNG generation after Phase 0 selection.
4. Confirm Windows `wave.sock` permissions are acceptable or in scope for audit.
