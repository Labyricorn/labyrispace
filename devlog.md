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
- Startup smoke check: new Electron build opened, frontend connected to the local backend, and a PowerShell terminal executed LABYRISPACE_STARTUP_OK. Used ignored .local/smoke data with usage telemetry disabled, diagnostic ping disabled, and loopback cloud endpoint overrides; no external web widget was loaded. Product defaults remain unchanged. Original evaluation sessions were left running.
