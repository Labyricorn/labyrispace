<!-- Modified by Labyricorn for Labyrispace; original upstream README preserved in README.upstream.md. -->
# Labyrispace

Labyrispace is Labyricorn's development fork of [Wave Terminal](https://github.com/wavetermdev/waveterm), based on v0.14.5. The goal is a terminal-centered workspace with adaptable panels across desktop, touch, and handheld workstations.

This is an early development baseline with Wave vendor connections disabled; it is not a finished or fully offline product. The application now uses the Labyrispace name and identity (app ID `com.labyricorn.labyrispace`, data folders named `labyrispace`), with internal identifiers such as `WAVETERM_*` environment variables, `wsh`, and protocol strings intentionally kept. See [the preserved upstream README](README.upstream.md) for upstream features and documentation.

## Implemented

- **AI Assistant settings**: set up LM Studio, OpenAI or Anthropic from a form (keys stored encrypted); nothing is contacted until you press a button or send a message.
- **Web Search settings** and a "Enter: search <host>" hint in the web widget address bar.
- **Web widgets** on other sites wait for **Load page**; remote Markdown images wait for a click.
- **Local Services** widget: listening TCP ports and UDP bindings with their processes, Copy, and Insert-into-terminal (never runs).
- **Import Wave Profile...** copies an existing Wave profile in.
- See NETWORK-BEHAVIOR.md for what is contacted, VENDOR-CONNECTIONS.md for removed Wave services, and INTERNAL-IDENTIFIERS.md for the Wave-derived names kept on purpose.

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

The Windows script builds the Windows x64 backend and shell helper from source, plus the Electron frontend. Use upstream build tasks for other architectures and remote helper binaries. Runtime data lives in ignored `.local/profile/`. It is separate from the earlier Wave evaluation and your normal Wave settings. Without the development environment overrides, the app stores data under `labyrispace` folders (for example `~/.config/labyrispace` and `%LOCALAPPDATA%labyrispace`), never a Wave install's `~/.waveterm`.

**File > Import Wave Profile...** copies a Wave data folder (and its config folder) into Labyrispace. Source folders are only read. Labyrispace restarts, moves the current profile into `profile-backups`, then applies the import. Close the other app first.

Full TypeScript checking currently fails on inherited preview fixtures. Development builds, the transfer tests, and the existing layout suite are separate checks; a successful build does not establish a clean typecheck.

## Network behavior

Wave telemetry collection/upload, diagnostic pings, telemetry-preference notifications, Wave-hosted AI, and upstream automatic updates are disabled in code. The starter workspace uses local Help. Existing vendor web widgets and vendor navigation are blocked without deleting saved layouts or user files. Imported settings cannot re-enable these services.

Your own AI providers/local models, local services, SSH, and other websites remain available. Programs launched in terminals have their own network behavior. This is not an operating-system firewall or a promise of complete offline operation.

See [VENDOR-CONNECTIONS.md](VENDOR-CONNECTIONS.md) for the affected features, remedies, and verification limits. Updates require installing reviewed Labyrispace builds manually.

## Planned direction

Responsive multi-display layouts and recovery, touch keyboard/key visualization with manual Password Mode, independent CLI-agent launch profiles, and extension contracts with Local Services as an early extension. These are plans, not implemented features. Product/design changes are discussed before implementation.

## Repository and license

- Development/default branch: `labyrispace`.
- `origin`: https://github.com/Labyricorn/labyrispace.git
- `upstream`: https://github.com/wavetermdev/waveterm.git
- [AGENTS.md](AGENTS.md) contains the project contract; [devlog.md](devlog.md) records implementation and verification.
- Apache-2.0; retain [LICENSE](LICENSE), [NOTICE](NOTICE), and applicable [dependency acknowledgements](ACKNOWLEDGEMENTS.md). See [BUILD.md](BUILD.md) for upstream build guidance. Redistributed upstream modifications carry change notices.
