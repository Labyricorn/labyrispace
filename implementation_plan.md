# Labyrispace implementation plan

Status: Revision 2, draft for user approval; implementation has not started.

Prepared: 2026-10-22. Source-review baseline: commit `6228452`.

## Objective

Make Labyrispace an independently branded, Windows-first application with explicit network behavior, guided AI and search setup, and a first in-tree widget (Local Services). Preserve working terminals, existing terminal transfer, saved workspaces, and user configuration.

This document proposes work; its existence does not authorize implementation. Approval should identify the phases to proceed with.

## Decisions recorded

| Topic | Decision |
|---|---|
| Fork stance | Hard fork: rebrand and improve. No upstream-merge constraints. |
| Audience | Only the owner for now; keep later open use in mind (no designs that block it). |
| Platform | Windows first and possibly only. macOS/Linux code and packaging stay in place, untested and unshipped. Nothing is deleted for platform reasons. |
| Profile identity | New Labyrispace app ID. A user-initiated import button copies (never moves) config and workspaces from an existing data directory. During development, the configured profile paths stay. |
| Web widgets | Saved URL and layout are kept; widget starts as a local placeholder with one-click load. Per-widget "load automatically on restore" toggle, default off, is part of Phase 3. |
| Remote document assets | Local assets load normally; external Markdown/CSS/custom-resource assets require an explicit load action. |
| Suggestion favicons | No remote fetch. Designed local icon set plus generic fallback (see Phase 0). |
| Search provider | No vendor preselected. First-run guided setup asks the user to choose; the chosen template is honored in every navigation path and the destination is shown before submit. |
| AI feature | Labeled "AI Assistant". Guided configuration for local services and frontier providers (Phase 2b). Keys live in Labyrispace's own secret store. |
| Telemetry | Remove event production and activity timers; keep backend enforcement against re-enablement. |
| Extension approach | Local Services is built in-tree first. A manifest/catalog contract is extracted only when a second widget exists. No runtime third-party catalog. |
| Terminal insertion | Insert only a constructed `host:port` endpoint by default; strip characters below 0x20 and 0x7F from anything else. Never append an execution keystroke. |
| Acceptance test | Expected-network allowlist file is checked into the repo; startup captures are compared against it. |
| Private catalog build | Deferred until a second widget or external catalog exists; then a plain local checkout with the owner's credential manager, no CI. |
| Compatibility | Retain internal identifiers (env vars, protocol strings) until a deliberate migration. |
| Attribution | Preserve LICENSE, NOTICE, modification notices, and an upstream acknowledgement. |
| Process | Commit and update `devlog.md` after each phase. Commits stay local; nothing is pushed. |

No new remote resource is fetched just because the application starts.

## Open items (do not block Phase 0 or 1)

| Item | Needed by | Default if unanswered |
|---|---|---|
| Suggestion icon set: which sites | Phase 0 | Small curated set plus generic fallback |
| Existing Wave profile you care about | Phase 2 | Treat dev profile as the only one; import button still built |
| Location of the existing test script | Phase 1 | Locate in this repo's `package.json`/Taskfile; read-only look in `G:\.vibe\edex-ui-labyricorn` or the wav-terminal-evaluation directory only if pointed at something specific |

## Phase 0 — Asset definition

1. Draft SVG candidates for the mark: a circular labyrinth with a cob of corn exiting the center goal at an angled, unicorn-horn angle. Two variants: a full mark (rings, kernels, horn spiral) for splash, about page and installer; a compact mark (ring gap and angled cob silhouette) for taskbar, tray and small `.ico` sizes.
2. Define name styling, tagline (optional), colour palette, and installer artwork needs. Windows only: multi-resolution `.ico` (16–256), no `.icns`.
3. Design the local suggestion-icon set (curated common sites plus generic fallback).

Checkpoint: user selects marks and palette. Phases that need artwork wait on this; other phases may proceed. Final branding is not invented without approval.

## Phase 1 — Inventory, baseline, and audits

1. Inventory visible branding, executable/package identity, artwork, support links, telemetry producers, network calls, and release tooling. Classify each as active, disabled, development-only, historical, or attribution. Record exact paths and expected replacements.
2. Locate and run the existing test script and development build with stable source. Record inherited preview TypeScript errors separately from new failures.
3. Establish isolated fresh and legacy-enabled test profiles. Preserve actual user profiles and running shells.
4. Audits (findings only, with limited remediation as noted):
   - Listener and authentication: what binds where (HTTP/WebSocket/domain socket) and what authenticates it. Remediation is in scope only for a non-loopback bind or missing authentication.
   - Secret store: encryption, storage location, and Wave-named paths in the inherited implementation.
   - Tsunami/custom-app integration and existing widget facilities: determine whether they suit Local Services before Phase 4 is scoped.
5. Write the initial expected-network allowlist.

Checkpoint (hard stop): inventory, baseline evidence, audit findings, and the Tsunami decision are reviewed before Phase 2 starts. Do not claim dependency-wide or OS-wide network isolation from source inspection.

## Phase 2 — Product identity and Labyricorn resources

1. Replace visible Wave names in windows, menus, dialogs, AI/config/app panels, tips, transfer hints, and development tooltips.
2. Apply approved Phase 0 artwork to runtime and installer. If not yet approved, keep pending.
3. Remove misleading hosted-AI claims and obsolete promotional pages. Preserve the local first-run initializer.
4. Replace Wave help/community links with bundled local pages or approved Labyricorn destinations; omit actions without a replacement. Update issue templates and documentation navigation.
5. New app ID, executable, and publisher identity. Check single-instance behavior, settings discovery, shortcuts, and coexistence with a Wave install. Build the user-initiated profile import (copy only, recoverable, never automatic).
6. Disable or retarget inherited Taskfile publishing destinations; review CI release titles, signing assumptions, upstream buckets, Winget identity, and author-setting tasks. Do not publish a release or add an updater.

Verification: inspect fresh/returning UI and generated packaging metadata; search runtime bundles for remaining visible branding against an allowlist of attribution and compatibility names. Verify the configured profile opens without being reset, import copies without modifying the source, local help works offline, and terminal startup/transfer still work.

Consequence: a distinct identity creates a separate installation and profile by design.

## Phase 2b — AI Assistant and search settings pages

Status: implemented 2026-10-22. Revised from a guided wizard to plain settings pages after owner feedback that JSON editing is confusing.

1. **AI Assistant page** (config view, replaces the "coming soon" stub; Raw JSON tab stays for anything else): cards for LM Studio, OpenAI and Anthropic with status, server address or API key, model box with provider-fetched suggestions, **Find models** / **Test key and find models**, **Save**, **Use as default**, **Remove**. It writes `waveai.json` and the secret store.
2. **Web Search page**: a dropdown of search engines (DuckDuckGo, Google, Bing, Brave, Startpage, custom address) showing the destination host. Default stays Google until changed.
3. **Empty state**: with no model configured the AI panel shows a "Set up AI Assistant" button that opens the AI page. No full-screen first-run prompt.
4. **Backend**: `AiListModelsCommand` RPC (provider-contacting model list, explicit user action only), an Anthropic provider preset (messages API, `ANTHROPIC_KEY`), and schema entries.
5. Keys are saved in the existing encrypted secret store (Electron safeStorage); nothing is contacted until the user presses a button or sends a message. Provider endpoints enter the allowlist only when configured.

Out of scope: forms for other settings files, Ollama, Google, OpenRouter and other providers (deferred list below).

Verification: Go unit tests for model listing (OpenAI, Anthropic, LM Studio, error cases) and the Anthropic defaults; typecheck; and a live check against a local mock LM Studio server (find models, save, default set, JSON written) plus the search dropdown. Real OpenAI and Anthropic keys and live chat were not exercised.

## Phase 3 — Remove bookkeeping and expose network behavior

Status: implemented 2026-10-22; see NETWORK-BEHAVIOR.md for the resulting matrix.

1. Removed Electron's activity timer, display reporting, terminal command counters, the command-text inspector, and about fifty frontend event/activity calls. Backend compatibility handlers stay inert.
2. Backend enforcement against telemetry re-enablement, Wave endpoint overrides, hosted AI, updates and vendor redirects is unchanged.
3. Bookmark-suggestion favicons are no longer fetched (package removed); suggestions show the local globe icon.
4. Saved web widgets on non-loopback hosts show a local placeholder with **Load page** and **Always load this widget** (`web:autoload` per widget, default off). Typing an address or searching counts as a request to load. Remote Markdown images show a per-image **Load** control. Remote `http(s)` tab-background images are not applied.
5. Typed words go to the search engine chosen under Web Search; an unusable template falls back to one shared default. The address bar shows "Enter: search <host>" before submit.
6. Docs-site Plausible analytics removed. The docs build still downloads a Google font for social-card images; bundling a TTF is left open (docs are not part of the app package).
7. NETWORK-BEHAVIOR.md documents startup, on-request, removed, and uncovered traffic.

Verification: unit tests for URL gating, search handling, background URLs; live checks on isolated profiles (saved widget gated, Load page loads, Always-load toggle not read back, search hint shown). Not done: packet capture of a packaged build, a live Markdown-image check, and the web-widget auth-key fix (owner testing).

## Phase 4 — Local Services (in-tree, Windows)

Status: implemented 2026-10-22 as a built-in view modeled on the process viewer (not Tsunami).

1. Backend `pkg/localservices` reads the OS socket table (gopsutil) for listening TCP ports and UDP bindings and attaches process name and path where available. On Windows a process snapshot supplies image names when the process cannot be opened without elevation. It never connects to any socket. Exposed through one RPC, `LocalServicesListCommand`.
2. Addresses are classified as loopback, wildcard or one interface, IPv4 or IPv6. The copy/insert endpoint is built only from a parsed IP and an integer port; wildcard binds map to loopback. No HTTP/HTTPS scheme is guessed, and UDP rows are labelled as open sockets only.
3. The `localservices` view (sidebar widget "services") has a text filter, TCP/UDP/This-computer-only toggles, manual Refresh, **Copy** and **Insert**. Insert types the endpoint into a chosen terminal of the current tab without a newline and strips control characters; it never runs anything.
4. No timers, no elevation, no upload. Non-Windows platforms show a notice and are untested.

Verification: Go tests with real TCP, UDP and IPv6 fixtures, closed-socket and missing-process cases, endpoint formatting and control-character rejection; frontend tests for filtering and sanitizing; live check with local fixtures (rows found with process names, Copy worked, Insert placed the endpoint at the PowerShell prompt unexecuted, a stopped fixture disappeared after Refresh). Not verified: Windows behavior under an elevated or restricted account, very large socket tables beyond the 1.7k seen here, and non-Windows platforms.

## Phase 5 — Integration and workstation evaluation

Status: run 2026-10-22 on a Windows development build. Results are in devlog.md and the verification sections of NETWORK-BEHAVIOR.md and VENDOR-CONNECTIONS.md.

Done:
1. Combined checks (test script, tsc, build) pass; tsc shows only the inherited preview-fixture errors.
2. Startup captures on a fresh and a hostile legacy profile: no non-loopback TCP, and no non-loopback DNS after disabling Chromium's proxy auto-detection (it was doing "wpad" lookups). Saved vendor widget stayed blocked.
3. Second-instance launch opened a second window; the Bing search choice persisted across restart; the import apply path worked again; a widget with an unknown view showed "No View Component" while the terminal and other widgets kept working.
4. Layout checks by viewport emulation at 1920x1080, 3440x1440, 1536x864 and 1280x800: no horizontal overflow in the workspace, Local Services, AI Assistant or Web Search pages.
5. Fixed bugs found along the way: corrupted characters in the Help page and the "Opening..." button; Help text now matches the new features.
6. INTERNAL-IDENTIFIERS.md lists the Wave-derived names kept on purpose.

Not done or not verified: live terminal transfer on this build (covered by the Go tests and the earlier live check), a packaged build or installer, touch, controller and on-screen-keyboard input (monitor and resolution checks are not requirements: the app runs in ordinary windows), real OpenAI/Anthropic keys, SSH and durable sessions, non-Windows platforms, and the web-widget auth-key fix (owner testing).

Checkpoint: this is the end of the plan. Installer distribution, signing, publication and production resources need their own approval.

## Deferred work

- Additional AI providers, each needing confirmed API details first: Ollama, Strata, FreeToken, Google (native Gemini vs OpenAI-compatible endpoint undecided), OpenRouter, Abacus (RouteLLM vs ChatLLM undecided), and a generic Anthropic-compatible gateway.
- Manifest/catalog contract, build-time catalog assembly, and a second curated widget (trigger: widget #2 exists).
- Independent widget downloads/updates, rollback, artifact signing, automated app updates, remote revocation.
- Plugin sandbox or restrictions on terminal-launched programs.
- Runtime third-party catalogs and user-submitted widgets.
- Broad helper/environment/protocol/storage renaming and automatic profile migration.
- macOS/Linux support; controller navigation, password-safe on-screen keyboard, saved workstation layouts, generic panel docking, additional CLI profiles.
- New hosting services, production analytics, whole-repository mergers.

## Approval and execution boundary

- Recommended first tranche: Phases 0 and 1, with a review stop after Phase 1. Phases 2–4 follow that review.
- After each phase: commit locally and update `devlog.md`. Nothing is pushed without a separate instruction.
- A failed checkpoint is resolved before dependent work proceeds.
- `AGENTS.md`, `devlog.md` and this plan are committed locally now, not pushed.
- Current deliverable is this plan only. No application source, runtime profile, remote repository, or hosting configuration is changed by preparing it.
