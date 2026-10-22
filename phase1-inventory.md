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

Finding confirmed by code-path review (2026-10-22, security test session; see SECURITY-TEST-PLAN.md) and **remediated the same day**: Electron injected `X-AuthKey` into every request from the default session that targeted the backend URL, and web widgets shared that default session, so a page loaded in a web widget could have had a valid key attached to its backend requests with no origin check on the receiving end. The guest-side preload (`emain/preload-webview.ts`) never exposed a key getter, so the only path was the shared session's header injection.

Remediation (implemented and verified 2026-10-22):
- App windows (tab views, builder windows) now use a dedicated `persist:labyrispace-app` session partition (`frontend/util/appsession.ts`, wired in `emain/emain-tabview.ts` and `emain/emain-builder.ts`); web widgets resolve to a separate `persist:labyrispace-web` partition via `resolveWebPartition` (`frontend/util/webpartition.ts`, now called from `frontend/app/view/webview/webview.tsx`). The two sessions never share state, so a web widget's session never carries the key.
- Auth-key injection is scoped to the app session only and gated by `shouldInjectAuthKey` (`emain/authkey-policy.ts`), which injects only for main-process requests (no `webContentsId`) and registered app windows, never for guest/unknown webContents (`emain/authkey.ts`, `emain/emain-appcontents.ts`).
- Main-process service calls (`ClientService.GetClientData`, `/wave/file`) go through the app session's `fetch` via `setMainFetch` (`frontend/util/fetchutil.ts`, registered in `emain/emain.ts`); `electron.net.fetch` (default session) is no longer used for backend calls.
- The backend now rejects requests whose `Origin` is not the app's own (`pkg/web/origin.go` `IsAllowedOriginForRequest`, wired in `pkg/web/web.go` `WebFnWrap` and `pkg/web/ws.go` `WebSocketUpgrader.CheckOrigin`), and `/wave/service` requires `Content-Type: application/json` (`pkg/web/web.go` `handleService`).

Verification: Layer 1 — all unit tests pass (`emain/authkey-policy.test.ts` 6/6, `frontend/util/webpartition.test.ts`, `pkg/web/origin_test.go` 5/5 with the three previously-skipped handler tests un-skipped and passing; the `it.fails` source marker is flipped to a passing assertion). Layer 2 (isolated profile under `.local/`) — app boots clean (no 401/403), app windows create the `labyrispace-app` partition on disk, a live `<webview>` renders with `partition="persist:labyrispace-web"` (`isSeparate: true`, distinct `labyrispace-web` partition dir on disk), and main-process service calls return 200. No attack page, port probe, or exploit script was built or run (out of scope in SECURITY-TEST-PLAN.md); the web-widget exposure conclusion rests on Electron's per-session webRequest isolation plus direct inspection of the call sites, now confirmed by the live partition split. HelpView does not make direct backend HTTP fetches (uses the wshrpc WebSocket channel), so it has no reliance on the HTTP injected key. Full project test script (`scripts/test-labyrispace.ps1`): 68 vitest tests + all Go packages pass.

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

1. Web-widget `X-AuthKey` exposure (5.1): **resolved 2026-10-22.** The fix is implemented and verified (dedicated `persist:labyrispace-app` session for app windows, `persist:labyrispace-web` for web widgets, auth-key injection scoped to the app session, backend `Origin` allowlist + `application/json` content-type requirement on `/wave/service`). HelpView was checked and has no reliance on the HTTP injected key (uses wshrpc). See the 5.1 remediation note and devlog 2026-10-22.
2. Confirm Tsunami is not used for Local Services (5.3).
3. Choose a rasterizer for `.ico` and PNG generation after Phase 0 selection.
4. Confirm Windows `wave.sock` permissions are acceptable or in scope for audit.
