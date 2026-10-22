# Labyrispace network behavior

Status after Phase 3 (2026-10-22). Based on source inspection plus the checks listed under Evidence. This is a description of what the application itself does, not a sandbox: programs you run in a terminal, web pages you load, and build tools make their own connections.

## At startup (fresh or old profile, nothing clicked)

The application talks only to itself:

- Backend HTTP and WebSocket on `127.0.0.1` (ephemeral port), protected by a per-launch auth key.
- A local domain socket and shell-helper RPC.
- Optional `localhost` pprof server only if `debug:pprofport` is set.

No DNS lookups or non-loopback connections are expected. Chromium's automatic proxy detection ("wpad" lookups) is switched off by default; set `LABYRISPACE_USE_SYSTEM_PROXY=1` if web widgets must use a system proxy. One Chromium behavior remains: an IPv6 reachability check opens a UDP socket toward a public address (`[2001:4860:4860::8888]:443`) and sends nothing; it only asks the OS for a route. The expected-destination list is `network-allowlist.json`. Saved web widgets, Markdown images and tab backgrounds on other hosts are not fetched at startup (see below).

## Only when you ask

| Action | Destination | Notes |
|---|---|---|
| Click **Load page** on a saved web widget, type an address, or turn on **Always load this widget** | The page's host, and whatever that page requests | Pages on `localhost`, `127.0.0.1`, `::1` load without asking. |
| Type words (not an address) in a web widget's address bar | The search engine chosen under Settings > Web Search | The address bar shows "Enter: search <host>" before you submit. Blank input and `about:blank` never leave the machine. |
| Click **Load** on a remote image in a Markdown preview or AI reply | The image's host | Per image. |
| **Find models** / **Test key and find models** in AI Assistant settings | LM Studio address you typed, `api.openai.com`, or `api.anthropic.com` | Sends the key you entered or saved. |
| Send a message to the AI Assistant | The endpoint of the model you selected | Nothing is sent before configuration. |
| SSH or WSL connections | The host you connect to | |
| Local Services view | None. It reads this computer's socket table and never connects to a listed port. | Refresh is manual. |
| Open in external browser | The link's host | Wave-service hosts are refused. |

## Removed or blocked

- Electron's one-minute activity timer, display reports, terminal command counters and the command-text inspector are gone. Compatibility RPC handlers remain in the backend but nothing calls them, and they do not upload.
- Favicons for bookmark suggestions are no longer fetched; suggestions use the local globe icon.
- Remote `http(s)` images in tab backgrounds are not applied (use a local file path).
- Wave-service hosts (`*.waveterm.dev`, the WaveTermDev GitHub namespace) are blocked in Go and Electron. Telemetry, hosted AI and upstream updates stay off even for old profiles.

## Not covered

- Anything a terminal program, web page, or extension does on its own.
- Development and build traffic: npm, Go modules, Zig, and Git. The docs site build still downloads a Google font for its social-card images (`docs/src/renderer/image-renderers.ts`); bundle a TTF font before building docs offline. The docs site is not part of the app package.
- Web widgets now run in their own `persist:labyrispace-web` session and the app's windows in `persist:labyrispace-app`, so web content never receives the backend auth key (see `phase1-inventory.md` 5.1 and `SECURITY-TEST-PLAN.md`). Existing web-widget logins and cookies from before this change are not carried over (one-time re-login). In development mode the backend's origin check is skipped.

## Evidence

- Phase 5 captures (Windows development build, Chromium net log plus sampling of established TCP connections for the whole app process tree): fresh profile and a hostile legacy profile (telemetry and auto-update flags on, a saved vendor web widget) showed no non-loopback TCP connections and no non-loopback DNS lookups after the proxy-detection fix. The vendor widget showed the local disabled message and never navigated. Before the fix the same capture showed eight `wpad` lookups.
- Unit tests: URL gating, search-template handling, background URL policy, vendor policy fixtures, provider model listing.
- Live checks on isolated profiles with a local mock server (see `devlog.md`). No packet capture of the packaged app has been done for Phase 3.
