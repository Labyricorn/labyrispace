# Labyrispace development log

## 2026-10-22 - Terminal transfer prototype
- User approved menu-based transfer of one terminal widget between two existing Wave windows, preserving the shell, with failure recovery. Broader workspace and media work remain excluded.
- Cloned upstream v0.14.5 into source/ and created prototype/terminal-window-transfer. No remote fork or push performed.
- Added atomic backend ownership transfer and queued layout actions. Source uses a new detach action rather than closeNode because closeNode calls onNodeDelete and destroys the controller.
- Added a terminal header menu that lists other windows by workspace/tab and validates source/destination again when selected.
- Installed root npm dependencies and a portable Zig 0.14.1 compiler in ../tools. Upstream Taskfile build requirements informed direct build commands.
- Baseline and final layout tests: 18 passed. Final Go tests pass all five transfer subtests, including a forced SQLite failure after ownership writes and rollback with no published updates.
- Transfer cases initially all passed, but Windows could not remove TempDir because WStore owns a global SQLite connection. Isolated the DB fixture in a child test process so handles close before parent cleanup.
- Full TypeScript check reports errors in unmodified frontend/preview fixtures. An external app-only typecheck configuration under ../tools still imports two failing preview mocks through WOS. Neither typecheck passes; modified files produced no diagnostics.
- Frontend build completes; optional documentation tsconfig and image optimizer dependencies emit warnings when documentation workspace is omitted. No unrelated dependency upgrades applied.
- Built dist/bin/wavesrv.x64.exe with Zig/CGO and copied the matching release wsh binaries into dist/bin. Added ../start-prototype.cmd with upstream Taskfile development cloud endpoints; without them, development server startup aborts.
- Live two-window verification used the actual terminal settings menu callback: widget 82555ce1 moved to the other active tab, source DOM removed it, and destination displayed its previous output. Shell PID 18668, variable transferMarker=wave-move-proof, and working directory G:/.vibe/wave-terminal-evaluation were preserved. An eight-tick command continued during transfer, and a command entered afterward confirmed the same state.
- Live request to a missing destination was rejected with ownership unchanged. Round-trip transfer also worked; moving the second window's final terminal left that window open and empty.
- Prototype remains a local source branch. No fork/push, media feature, or eDEX changes. Running processes retain their original environment; Wave helper commands that use launch-time tab/workspace IDs, remote/durable sessions, and full-screen terminal apps need further evaluation.

## 2026-10-22 - Fork and independent development setup
- User approved the name Labyrispace and requested a GitHub fork and local development project at G:/.vibe/labyrispace.
- Created public GitHub fork Labyricorn/labyrispace of wavetermdev/waveterm. Copied the v0.14.5 checkout and existing uncommitted prototype into an independent repository; retained the old evaluation and its running sessions unchanged.
- Set origin to the new fork and upstream to Wave. Use labyrispace as the development/default branch, retaining upstream main without rewriting it.
- Added project README and AGENTS contracts; preserved upstream README as README.upstream.md with matching hash. LICENSE and NOTICE also match upstream. Added modification notices to changed upstream source files and Labyricorn copyright to new source files.
- Installed npm dependencies independently. Copied Zig 0.14.1 into ignored .local/tools/zig and added relative build, test, and launch scripts. Runtime data belongs in ignored .local/profile; no dependency on the evaluation directory is required.
- Privacy audit found default-on telemetry and four uploaded startup/tab/count/display events in the original prototype, an independent diagnostic ping, preference notifications, default GitHub page, Wave cloud AI, and upstream release URL. Documented as highest-priority next discussion; no privacy or UI branding changes implemented during repository setup.
- Parent DOX index and evaluation ownership were updated. No new child instruction boundaries were required for scripts/; the project root owns them.

- Independent checkout verification: build-labyrispace.ps1 completed (Windows server/helper and Electron frontend). test-labyrispace.ps1 passed all five transfer subtests and 18 layout tests. Existing documentation-tsconfig/image-optimizer warnings remain; the known inherited preview typecheck failure is not fixed here. Dependency installation reports inherited npm audit findings; no unrelated dependency upgrades were applied.
- Startup smoke check: new Electron build opened, frontend connected to the local backend, and a PowerShell terminal executed LABYRISPACE_STARTUP_OK. Used ignored .local/smoke data with usage telemetry disabled, diagnostic ping disabled, and loopback cloud endpoint overrides; no external web widget was loaded at the initial verification snapshot. Later onboarding created the upstream GitHub starter widget before the smoke app was stopped, so this was not a zero-egress test. Product defaults remain unchanged. Original evaluation sessions were left running.

- Initial project commit e97b3e7 was pushed to origin/labyrispace and GitHub default branch set to labyrispace. Smoke application stopped after verification; original evaluation remains separate.


## 2026-10-22 - Remove Wave vendor connections
- User authorized removing vendor connections and requested a functionality-impact report plus remedies.
- Removed cloud HTTP transport implementation, telemetry collection, send/config notification loops, diagnostic loop, updater implementation/feed, and Wave-hosted AI defaults. Compatibility RPCs remain inert or return a disabled-policy error. Backend startup no longer requires cloud endpoint variables.
- Effective configuration overrides legacy telemetry/update/cloud flags and removes vendor AI modes without rewriting user files. Added a shared Go/TypeScript URL-policy fixture, HTTP redirect enforcement, Electron session request blocking, and guarded external-browser handoffs.
- Replaced the GitHub starter page with local Help, vendor onboarding/telemetry solicitation with local guidance, and About links with retained attribution. Saved vendor web widgets show a local explanation while retaining their saved URL.
- Fixed an inherited browser normalization bug discovered in live validation: about:blank was treated as a Google search and its navigation overwrote a blocked widget's saved URL. Blank URLs now remain local, placeholder navigation cannot rewrite vendor metadata, and five webview tests pass including new regression cases. The first network trace is a failed test and is not evidence of zero egress.
- Windows backend/helper/frontend builds succeed. Backend/vendor/config/AI/transfer suites pass, along with 36 layout/URL-policy tests and five webview tests. TypeScript checking has only the inherited preview-fixture errors; no new application diagnostics remain.
- Runtime validation before the browser correction: startup without opt-out/cloud-endpoint overrides, local welcome/help, blocked vendor requests/redirects, refused telemetry opt-in, zero telemetry/activity records despite old settings enabled, a successful local mock AI reply, and terminal transfer preserving PID/state/cwd. Final post-correction network/restart results follow below.

- Post-correction hostile-profile restart: saved vendor widget retained its address and displayed the local disabled-service message; its webview stayed at about:blank. Legacy enabled settings and supplied Wave endpoint overrides could not restore vendor services. Telemetry/activity tables stayed empty.
- Final scoped connection snapshot showed zero established external connections. The final Chromium NetLog had 18,743 events, only loopback TCP addresses, and zero DNS transactions. Vendor URLs appeared only in deliberate blocked probes. Raw traces and profiles are ignored under .local/, never staged.
- AI clients with explicit proxies now wrap the vendor policy as well; vendor proxy URLs and redirects through permitted proxies are covered by a regression test. Normal local provider requests were verified with a streamed mock response; real provider credentials/inference and builder generation remain untested.
- VENDOR-CONNECTIONS.md records disabled/shunted features, retained capabilities, remedies, evidence, and limits. Root AGENTS was reviewed; the existing project boundary/index is unchanged. Original Wave evaluation and eDEX remain untouched.

- Final combined test script passes all backend packages and 41 frontend tests. A transient Go import-cache failure occurred when a previous test overlapped source edits; rerunning with stable source passed. Final rebuilt backend was started again and local HTTP/mock AI requests still succeeded while vendor calls/redirects were blocked.
- LICENSE and NOTICE hashes remain unchanged. No new dependencies were added. Test apps/mock server were closed; no validation profiles, databases, raw logs, or traces are included in the commit.


## 2026-10-22 - Remove inherited Wave upgrade promotions
- User supplied a screenshot of the v0.14 upgrade modal with GitHub-star buttons and explicitly requested removal.
- Removed startup version-check/rendering, upgrade modal registry entries, and the upstream Release Notes menu. Removed the screenshot's minor-upgrade promotion implementation; only inert preview-compatible exports remain.
- This suppresses the inherited modal even for older profiles with missing onboarding:lastversion metadata. The separate local first-run workspace initializer and backend/profile data are preserved.
- Updated the project contract and vendor functionality report. Parent DOX boundaries/index remain unchanged.
- Verification: development frontend build passed; compiled JavaScript contains none of the screenshot promotion strings. An isolated saved profile forced to onboarding version v0.0.0 started with two terminals and no modal/promotion. Full typecheck reports only the previously recorded preview-fixture errors. Closed the isolated test app; the user session/profile was untouched.

## 2026-10-22 - Curated resources implementation proposal
- User requested a plan for approval after source review and discussion of Labyricorn-controlled widget resources. Created implementation_plan.md with decision register, six phases, consequences, verification checkpoints, and explicit deferred work.
- Proposed bundled delivery first; exact catalog location, remote-content defaults, final artwork, identity migration, and later independent updates remain approval decisions. Local Services is the first extension; no generic panel docking or unrelated workstation feature implementation is included.
- Recorded the curated-source direction in AGENTS.md and corrected its telemetry description: Electron's local activity producer remains active although backend persistence/upload is disabled.
- Documentation-only change. Checked diff formatting and plan scope; application tests were not rerun because executable code was unchanged. Parent/project instruction boundaries remain unchanged; no new child boundary is needed.

## 2026-10-22 - Phases 0 and 1 (assets, inventory, audits)
- Approved revised plan: Phases 0 and 1 with a review stop after Phase 1. No application source changed.
- Phase 0: drafted two mark candidates (A teal, B violet) with full and compact SVGs plus a generic suggestion icon in assets/brand/. Owner selected B and asked for the middle/inner ring opening to be rotated 90 degrees so it is not hidden by the cob; applied to both B files and checked in a render. Artwork is not wired into the app; no rasterizer is installed (sharp missing), so .ico/PNG generation needs a tool choice.
- Phase 1: wrote phase1-inventory.md (identity, release tooling, telemetry, network call sites, audits) and a draft network-allowlist.json. Source inspection only; no runtime capture.
- Audit findings: backend binds 127.0.0.1 with a per-launch auth key; /schema/ is unauthenticated (static); secrets use Electron safeStorage in secrets.enc (0600). Unconfirmed finding: Electron injects the auth key into default-session requests to the backend and web widgets use the default session, so a loaded page could send authenticated requests. Needs a controlled test and a scope decision. Tsunami builds Go/Node at runtime, so Local Services should be a built-in view modeled on processviewer. Electron activity timer and remote favicon fetch remain active.
- Baseline: test script exit 0 (7 Go packages pass, 3 have no tests, 41 frontend tests pass); build script exit 0 with the inherited sharp warning. Logs are in ignored .local/phase1/.
- Stopped for Phase 1 review; nothing pushed.
- Owner then asked to turn the outer ring 90 degrees; applied to both B files (outer opening now upper left), checked in a render.
- Auth-key exposure: owner will perform security testing separately with another model; no reproduction or security tests are run here. Fix is proposed in phase1-inventory.md section 8, not implemented.

## 2026-10-22 - Phase 2 identity and resources
- Owner approved Phase 2; the web-widget auth-key fix is held until the owner's separate security testing.
- Renamed visible Wave strings to Labyrispace / AI Assistant (Electron app name and menus, dialogs, window titles, frontend panels, wsh help, AI system prompt). New app ID com.labyricorn.labyrispace, productName Labyrispace, author Labyricorn. Default data/config/electron folders and the Go cache folder are now named labyrispace so a Wave install's ~/.waveterm is never adopted. WAVETERM_* variables, wsh, wave.lock, JWT issuer and remote helper paths are kept deliberately.
- Removed: Wave Discord/docs/Learn More links, BYOK and free-beta AI claims, upgrade and star-ask onboarding pages, Wave-hosted AI section label, ARM64 docs link. Docs site config loses upstream nav and Algolia; Plausible and remote fonts remain for Phase 3.
- Release tooling: removed S3/snap/winget tasks and bucket vars, the release/deploy/TestDriver/bump-version workflows, CNAME, FUNDING.yml; issue templates now point at Labyricorn/labyrispace. No release process or updater exists.
- Icons: candidate B generated by scripts/generate-icons.cjs (Electron offscreen render, no new dependency) into build/icon.ico, build/icons, public/logos, assets/appicon-windows, frontend logo. Verified 256 and 32 px renders. Installer banner art not made; no installer was built.
- Profile import: File > Import Wave Profile... copies chosen Wave data/config folders (read-only source) into profile-pending; the next start moves the current profile to profile-backups and applies the import before the backend starts (emain/emain-import.ts). Applying was verified with two isolated profiles (settings replaced, backup created, pending removed, app up). The native folder pickers and confirm dialogs were not exercised.
- Build gotcha: electron-vite's shim step treats text like "pending-import" followed by a quote as an import statement and truncates the main bundle; folder names and log strings avoid it (comment in emain-import.ts).
- Verification: test script exit 0 (7 Go packages, 41 frontend tests); tsc shows only the 17 inherited preview-fixture errors; build exit 0; two-profile smoke showed window titles Labyrispace. Remaining in bundles: attribution text in About, and some internal names. Not verified: default paths without env overrides, installer, a real Wave profile import.
