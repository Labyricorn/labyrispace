# Labyrispace

## Purpose and ownership
- Labyricorn's Apache-2.0 fork of wavetermdev/waveterm, starting from v0.14.5 (97e5600) and the tested terminal-window transfer prototype.
- Read parent G:/.vibe/AGENTS.md when present and this project's devlog.md before edits. This file remains the project contract on other machines.
- origin: https://github.com/Labyricorn/labyrispace.git; upstream: https://github.com/wavetermdev/waveterm.git.
- The labyrispace branch is the development/default branch. Keep upstream history and license/NOTICE attribution intact. Mark modified upstream files.
- The user authorized creating/pushing this fork and setting it up locally. Discuss further product/design changes before implementing them. Listed plans are not implementation authorization.
- The original portable Wave evaluation and its profile remain in G:/.vibe/wave-terminal-evaluation. Do not overwrite them or the separate eDEX project.

## Local contracts
- Terminal transfer uses a header menu to move into another existing window's active tab. Preserve block ID, backend controller, shell, and output.
- Transfer ownership and queue source detach/destination insert in one transaction. Failure must leave ownership/layout queues unchanged.
- Source detach must bypass normal widget close, which destroys the controller. Reject stale sources/destinations and non-terminal widgets. Leave an empty source tab/window open.
- Remote/durable sessions, full-screen terminal apps, and Wave helpers using launch-time tab/workspace environment variables remain unverified. A running shell's environment is not rewritten by transfer.
- Privacy is the highest-priority next discussion. Current source still has default-on usage telemetry, a separate daily diagnostic ping, telemetry-preference notifications, Wave cloud AI, upstream update URLs, and an automatic GitHub starter page. Do not describe it as offline/private or silently change network policy.
- LICENSE and NOTICE must remain. Third-party licenses need review before redistribution or combining repositories.

## Product direction (planned)
- A full core experience on a single non-touch 1920x1080 display; responsive multi-display layouts, scaling, detachable panels, saved workstation profiles, and display-disconnection recovery.
- Workstations include 3440x1440 plus two non-touch 1080p displays (one spacedesk); Chuwi touch tablet with an upper 2K display (exact size unmeasured); ROG Ally X touch handheld with upper 4K monitor; single non-touch 1080p desktop; touch 1080p laptop with optional non-touch 1080p display to its left.
- Preserve optional on-screen keyboard and streaming key visualization. Manual Password Mode must suppress all visualization, clear highlights/history, never replay hidden input, and remain enabled until manually disabled. Automatic detection is optional.
- Independent terminal launch profiles for Claude Code, Codex, Antigravity, OpenCode, and Pi. Test CLI compatibility; graphical app embedding is separate. Controller navigation on Ally is desired.
- Extension support in the core; Local Services is a separate early extension for listener/UDP discovery, process identification, and copy/insert endpoint actions. Insertion never executes automatically.
- Evaluate selected AegisUi features after defining extension contracts; no whole-repository merger approved. Non-terminal panel/media docking needs further design discussion.

## Work guidance
- Root README.md is the fork entry point; README.upstream.md preserves upstream documentation. BUILD.md and CONTRIBUTING.md remain upstream guidance.
- scripts/ holds Windows build, test, and launch helpers; it has no separate instruction boundary.
- .local/ is ignored and owns machine-specific compiler tools, runtime profiles, logs, and smoke-test data. Never commit profiles, local databases, dependencies, binaries, credentials, or private settings.
- Install: npm ci --workspaces=false. Go and a Windows CGO C compiler are required. This workstation uses Zig 0.14.1 in .local/tools/zig/; scripts/zig-cc.cmd also accepts LABYRISPACE_ZIG or zig on PATH.
- Build: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-labyrispace.ps1. Builds Windows x64 server/helper and Electron frontend. Remote helper binaries require upstream multi-platform build tasks.
- Launch: start-labyrispace.cmd. Uses .local/profile and retains upstream development endpoints; launching still permits the documented vendor traffic. Runtime UI/package branding remains Wave pending a separate rebranding pass.
- Keep ELECTRON_RUN_AS_NODE unset for application launch.

## Verification
- powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-labyrispace.ps1 runs transfer/rollback tests and the existing layout suite.
- Full TypeScript check currently fails in unmodified frontend/preview fixtures; do not report it as passing. Development builds can still succeed.
- Startup smoke tests use an isolated .local/smoke profile, telemetry disabled, WAVETERM_NOPING=1, and unavailable loopback cloud endpoints. This test setup does not change product defaults.
- Verify shell identity/state, continued output and input, ownership rollback, and layout behavior for any transfer changes. Packaging success alone is insufficient.

## Child DOX index
- None.
