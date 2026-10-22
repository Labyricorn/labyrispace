<!-- Modified by Labyricorn for Labyrispace; original upstream README preserved in README.upstream.md. -->
# Labyrispace

Labyrispace is Labyricorn's development fork of [Wave Terminal](https://github.com/wavetermdev/waveterm), based on v0.14.5. The goal is a terminal-centered workspace with adaptable panels across desktop, touch, and handheld workstations.

This is an early development baseline, not a finished or offline product. The application UI and package still use Wave branding. See [the preserved upstream README](README.upstream.md) for upstream features and documentation.

## Implemented

A terminal's header gear menu has **Move terminal to window...**. Choose another open window to move the terminal into that window's active tab. The transfer preserves the widget identity, running shell, working directory, variables, and output. Failed ownership transfers roll back; moving the last terminal leaves its source window open. Open another window with Ctrl+Shift+N.

Local PowerShell transfer was verified in both directions while a command continued producing output. Remote/durable sessions, full-screen terminal apps, and Wave helper commands that use launch-time tab/workspace environment variables still need evaluation.

## Windows development

Prerequisites: Node.js/npm, Go (see go.mod), and a CGO C compiler. This workstation uses Zig 0.14.1 at `.local/tools/zig/zig.exe`. Alternatively install Zig on PATH or set `LABYRISPACE_ZIG` to its executable path; an existing `CC` is respected.

```powershell
npm ci --workspaces=false
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-labyrispace.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-labyrispace.ps1
.\start-labyrispace.cmd
```

The Windows script builds the Windows x64 backend and shell helper from source, plus the Electron frontend. Use upstream build tasks for other architectures and remote helper binaries. Runtime data lives in ignored `.local/profile/`. It is separate from the earlier Wave evaluation and your normal Wave settings.

Full TypeScript checking currently fails on inherited preview fixtures. Development builds, the transfer tests, and the existing layout suite are separate checks; a successful build does not establish a clean typecheck.

## Network behavior and next discussion

**Vendor connections have not been removed.** Upstream defaults include usage telemetry, a separate daily diagnostic ping, telemetry-preference notifications, an automatic GitHub starter page, and Wave cloud AI. The development launcher retains upstream development service endpoints. Development mode skips automatic updates, but packaged builds still point to Wave's release server.

Removing those automatic connections is the highest-priority proposed next change. This repository must not be described as offline/private until the behavior is changed and verified with network traffic inspection. AI tools launched inside terminals have their own network behavior.

## Planned direction

Responsive multi-display layouts and recovery, touch keyboard/key visualization with manual Password Mode, independent CLI-agent launch profiles, and extension contracts with Local Services as an early extension. These are plans, not implemented features. Product/design changes are discussed before implementation.

## Repository and license

- Development/default branch: `labyrispace`.
- `origin`: https://github.com/Labyricorn/labyrispace.git
- `upstream`: https://github.com/wavetermdev/waveterm.git
- [AGENTS.md](AGENTS.md) contains the project contract; [devlog.md](devlog.md) records implementation and verification.
- Apache-2.0; retain [LICENSE](LICENSE), [NOTICE](NOTICE), and applicable [dependency acknowledgements](ACKNOWLEDGEMENTS.md). See [BUILD.md](BUILD.md) for upstream build guidance. Redistributed upstream modifications carry change notices.
