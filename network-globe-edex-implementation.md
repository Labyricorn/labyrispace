# Network Globe widget (eDEX-UI inspired): implementation plan

Status: revision 5. Phases E0 (contract and host), E1 (data services) and E2 (the widget UI) are implemented and verified in a development build; E3 (explicit network buttons and the real database release) and E4 (final verification) are not done.

This widget is two things at once: a rebuild of eDEX-UI's network panel and rotating globe, and **the first external widget**, so it also defines the small contract later external widgets use.

## Decisions recorded

| Topic | Decision |
|---|---|
| Satellites | Decorative for now, labelled as illustrative. Real tracking is a later opt-in |
| GeoIP database | Downloaded once, at widget "install time", through a gated host mechanism that other widgets can use. Source is a **Labyricorn-controlled, pinned mirror** of DB-IP Lite (Option A); a user-supplied `.mmdb` stays available. Country level first |
| Distribution | Bundled with the app only, and development builds only for now |
| Live refresh | On while the widget is visible (local socket-table reads only), with a toggle |
| Online state | Read from the OS's own connectivity assessment, no traffic from us |
| "You" pin | Approximate location from the time zone, with a manual override; public IP only on a button; no router (UPnP) lookup |
| Latency | To the default gateway, on demand only (no live toggle) |
| Install time | The first time the widget is added to a tab |

## 1. What eDEX-UI does today (from its source)

Read from `G:\.vibe\edex-ui-labyricorn` (`src/classes/netstat.class.js`, `locationGlobe.class.js`, `conninfo.class.js`).

| Feature | How eDEX-UI does it | Network behavior |
|---|---|---|
| Network status panel (state, local IPv4, ping, interface name) | `systeminformation` interface list; default-route interface | Pings `1.1.1.1:80` by TCP connect **every 2 seconds** |
| Public IP and location | HTTPS call to `myexternalip.com`, then a GeoIP lookup | External call about every 20 seconds while online |
| GeoIP database | `geolite2-redist` downloads GeoLite2-City at startup | External download |
| Rotating globe | Vendored fork of arscan's ENCOM Globe (about 1 MB) plus a 960 KB land-tile file | None |
| Connection pins and routing | Every 3 seconds, lists ESTABLISHED connections, geolocates each peer address, adds a pin and a marker | None beyond the lookups above |
| "Satellites" | **Decorative**: six at random positions and altitudes each launch. Not tracked real satellites | None |
| Traffic charts | `networkStats` for the active interface | None |

## 2. How each conflicting behavior is handled

| eDEX-UI behavior | Our replacement |
|---|---|
| Ping to `1.1.1.1` every 2 seconds | ONLINE/LOCAL/OFFLINE comes from Windows' own connectivity assessment (Network List Manager), which the OS runs anyway. A **Measure latency** button times a connection to the default gateway on your LAN. No Internet target unless you type one, and the host service checks it against the widget's allowed list |
| Public IP lookup every ~20 seconds | Your pin defaults to a time-zone approximation, labelled as such, with a manual lat/lon override. A **Look up public IP** button uses a provider you choose (no built-in default), keeps the result in memory only, and never repeats on its own |
| GeoIP database download at startup | One gated download at install time (section 6), from one pinned Labyricorn-controlled source, verified by SHA-256 |

## 3. Network classes (the rule for all external widgets)

| Class | Rule | Examples here |
|---|---|---|
| Local only | Always allowed | Socket table, interfaces, OS connectivity state |
| Local network | On a button press | Gateway latency |
| Third party | On a button press, to a host you chose, memory only, never automatic | Public-IP lookup |
| Install-time download | Declared in the manifest, approved by you, pinned host and hash, once | GeoIP database |

This table is also recorded in `NETWORK-BEHAVIOR.md`.

## 4. Licensing decision

- eDEX-UI is **GPL-3.0**. Labyrispace is **Apache-2.0**. Copied eDEX code would pull the combined work under the GPL, and the eDEX contributors hold that copyright.
- The vendored globe is a fork of ENCOM Globe by Rob Scanlon; its own license must be checked before any reuse.
- **Plan:** eDEX-UI is a functional reference only. Write the widget from scratch with permissive parts: three.js (MIT), Natural Earth land data (public domain), `maxminddb-golang` (ISC), and DB-IP Lite (CC BY 4.0, redistribution allowed with attribution). Not legal advice; confirm before copying anything else.

## 5. What the widget does

1. **Status panel.** Connectivity state, interface name, local IPv4 and IPv6 for the default-route interface, gateway. Local OS data only.
2. **Rotating globe.** A dotted-land sphere with decorative orbit rings and satellites, labelled illustrative in settings.
3. **Connection pins and routing arcs.** Each established connection's remote address is geolocated from the local database and drawn as a pin with an animated arc from your pin. Click a pin or row for details: remote address and port, state, owning process, country.
4. **Local markers.** Private, loopback and link-local peers are listed as "local network" and not placed on the globe.
5. **Buttons.** Measure gateway latency, look up public IP, update the database (the same gate as the first download).

## 6. The external widget contract (version 1, deliberately small)

"External" means a separate package with its own manifest, built outside the app core and run in isolation.

### 6.1 Package layout

```
widgets/network-globe/
  manifest.json
  src/             (TypeScript, three.js)
  assets/          (land-dots.json, icons, licenses)
  build output -> dist/widgets/network-globe/
```

Bundled with the application at build time, development builds only for now. No downloader, no marketplace, no user-folder scanning.

### 6.2 Manifest fields

| Field | Purpose |
|---|---|
| `id`, `name`, `version` | Stable id (`network-globe`), display name, widget version |
| `hostApi` | Host API version range; load is refused if incompatible |
| `entry` | HTML entry inside the package |
| `capabilities` | Host services the widget may call: `network.connections`, `network.interfaces`, `network.geolookup`, `network.latency`, `settings`, `theme` |
| `network` | Outbound destinations the widget itself may reach, with a purpose each. Default: none |
| `installDownloads` | Files the host may fetch once at install time: `id`, `url`, `sha256`, `sizeBytes`, `license`, `purpose` |
| `license`, `attribution`, `sourceCommit` | Provenance, shown in a details view |
| `settings` | Optional schema for the widget's own settings |

### 6.3 How the host runs it

- A single new built-in view, `extwidget`, hosts any external widget. It reads `ext:id` from the block metadata, validates the manifest, and loads the entry in a `<webview>`.
- Each widget gets its own session partition (for example `persist:labyrispace-ext-network-globe`). Building on the security fix, guest content never shares the app session and never receives the backend auth key.
- The widget talks to the host only through a small preload bridge (`window.labyrispaceWidget`). Each call goes to the main process, which finds the calling widget by webContents id and checks the manifest's `capabilities`. Undeclared calls are refused. The bridge never exposes the auth key, file paths, or arbitrary RPC.
- **Network enforcement:** a request filter on the widget's partition cancels anything not on the manifest's `network` list (empty by default, so the widget cannot reach the Internet). Host services that make network calls on the widget's behalf (latency, public IP) apply the same allowed-destination check.
- Lifecycle: the webview is destroyed on block close; the widget gets visibility events so it can stop animating when hidden. A failed widget shows an error panel and other blocks keep working.
- The sidebar entry is an ordinary `widgets.json` item whose block definition is `{ "view": "extwidget", "ext:id": "network-globe" }`.

### 6.4 The install-time download gate

Used by any widget that declares `installDownloads`.

1. **Trigger.** The first time the widget is added to a tab (widgets are bundled, so this is the install moment). The host checks whether each declared file is already present and valid.
2. **Prompt.** A host dialog, not widget UI: file name, size, source host, purpose, license and attribution, and the exact path it will be stored under. Buttons: Download, Not now.
3. **Declining.** The widget still loads; features that need the file show an explanation and a button that reopens the same prompt.
4. **Download.** Performed by the Go backend through the existing vendor-policy transport, only from the manifest's host. No redirects to other hosts, TLS required, size cap equal to the declared size, progress and cancel.
5. **Verification.** SHA-256 must match the manifest before the file is moved into the widget's data folder. A mismatch deletes the file and shows an error.
6. **Source.** For the GeoIP database, a Labyricorn-controlled release asset holding a month-pinned copy of the DB-IP Lite country file (CC BY 4.0, attribution shown in the widget's details view). Updates ship by releasing a new pinned copy with a new manifest, and happen only when you press **Update database**.
7. **Record.** Each download is logged with time, source, size and hash in a record you can read in the widget's details view.
8. **Alternative.** You may pick your own `.mmdb` file instead; it is copied into the widget's data folder and no network is used.

## 7. Host services the widget uses

All run locally in the Go backend and are reached only through the bridge.

| Service | Source | Notes |
|---|---|---|
| `network.interfaces` | gopsutil interfaces, the Windows adapter list for the default gateway, and the Network List Manager connectivity state | Name, up/down, addresses, gateway, default-route flag, connectivity level |
| `network.connections` | Extension of `pkg/localservices`: `ListConnections` returns non-listening TCP states with remote address, port, state, pid, process name | Same process-name fallback as Local Services; no connections are opened |
| `network.geolookup` | `maxminddb-golang` over the installed database | IPs never leave the machine. No database means pins are listed but not placed |
| `network.latency` | One TCP connect timing to the default gateway, or a destination on the widget's allowed list | Runs only when called by a button press; the bridge rate-limits repeated calls |
| `settings` | A JSON file per widget under the profile's config folder | The widget reads and writes only its own namespace |
| `theme` | Current colors and font | Pushed as events |

## 8. Globe and rendering design

- Dotted land: about 10,000 to 15,000 points on a sphere generated from Natural Earth 110m land at build time, stored as a compact JSON file of a few hundred KB. No runtime download.
- Rendering: three.js `Points` for land, an instanced mesh for pins, Bezier arcs lifted above the surface with an animated dash for packets, a faint atmosphere shell, and thin orbit rings with a few decorative satellites.
- Budgets: 30 fps cap, at most 300 pins and 100 arcs, pause when hidden, static globe when the OS requests reduced motion.
- Fallback: if WebGL is unavailable, draw a 2D equirectangular map with the same pins and a notice.
- Refresh: connection list every 3 seconds while visible (local reads only), stopped when hidden, with a Refresh button and a Live toggle.
- Accessibility: every pin also appears as a row in a table beside the globe; arrow keys move between rows; colors meet contrast needs in both themes.
- Privacy aid: a "hide addresses" toggle for screenshots.

## 9. Work breakdown

**Phase E0: contract and host**
1. Manifest schema, validator, loader, compatibility check.
2. `extwidget` view, per-widget partition, bridge preload, capability enforcement, per-partition request filter.
3. The install-time download gate (section 6.4) with its dialog, verifier and record.
4. Tests: manifest rejection cases; an undeclared capability is refused; an undeclared host is cancelled; the widget partition never receives the auth key; a download with a wrong hash is deleted; a download from a different host or a redirect is refused; declining leaves the widget loadable; a broken widget leaves other blocks working.

**Phase E1: data services (Go)**
1. `pkg/localservices`: `ListConnections`; RPCs for connections, interfaces and connectivity, geo lookup, and gateway latency.
2. Tests: real loopback TCP connections (established pairs, IPv6), private-range classification, process-exit races, missing identity, no database, a lookup against a tiny generated `.mmdb`, a fake resolver for the rest, latency refuses a destination off the allowed list.

**Phase E2: the widget**
1. Status panel, table, details view, settings (database source, live refresh, reduced motion, hide addresses, manual location).
2. Globe, arcs, pins, orbit decoration, fallback.
3. Tests: pure functions (great-circle arc math, private-address classification, pin capping, ordering, time-zone approximation) with vitest; a headless render smoke test; the frame loop stops when hidden.

**Phase E3: explicit network actions and the database release**
1. Latency and public-IP buttons with the runtime host approval step for the chosen provider.
2. Prepare the Labyricorn release asset: month-pinned DB-IP Lite country `.mmdb` with attribution notice and recorded SHA-256, plus the manifest entry.
3. Tests: nothing is requested until a button is pressed; an unapproved host is cancelled; results are not persisted.

**Phase E4: verification and docs**
1. Isolated profile: a startup capture shows no new traffic with the widget open and idle; local test servers appear as connection rows; a test database maps a test address to a pin; the download gate works end to end against a local mock server using a pinned test hash.
2. Update `NETWORK-BEHAVIOR.md` (network classes, the gate), `network-allowlist.json`, Help text, README and the devlog. Commit after each phase; no push without your word.

## 9a. Phase E0 results (2026-10-22)

Implemented: manifest schema and policy functions (`frontend/util/extwidgetmanifest.ts`), the host (`emain/emain-extwidget.ts`, `emain/preload-extwidget.ts`), the generic `extwidget` view (`frontend/app/view/extwidget`), the gated download in Go (`pkg/assetdl`, `AssetDownloadCommand`), `scripts/build-widgets.cjs`, a stub `network-globe` package, and a development-only `selftest` package.

Checked live on isolated profiles, with a local mock server recording every request:
- Inside the widget page only `labyrispaceWidget.call` exists; `require`, `process`, the app's `window.api` and `window.electron` are all undefined.
- Declared calls work (host info, settings read and write). Undeclared capabilities, unknown methods and `__proto__` are refused.
- A `fetch` to an Internet host and one to the loopback address both fail, because the widget's session cancels everything not on its manifest list.
- The download prompt appeared with no request sent. Pressing Enter (the default, "Not now") sent no request, the widget still loaded, and the decline was logged. Choosing Download later sent exactly one request, the file's SHA-256 matched the pinned value, and the record was written.
- A widget id that is not installed shows an error panel and every other block keeps working.

Found and fixed during testing: the dialog's default button was Download, so Enter approved it. "Not now" is now the first and default button.

Differences from the plan above:
- The download dialog has no progress bar or cancel button yet (the backend enforces size, host, redirect and checksum limits). The 15 minute backend timeout applies.
- `theme.get` returns only the light or dark preference for now.
- The `network.*` services are declared capabilities that return "not available yet" until E1.
- Loopback http download addresses are accepted only in development builds.
- Automated tests: 16 manifest and policy tests, 8 download tests (checksum mismatch leaves nothing behind, redirects and non-https refused, size cap, vendor hosts blocked, path safety). The live checks above were done by hand with a keyboard-driven dialog and are not automated.

## 9b. Phase E1 results (2026-10-22)

Implemented in Go, reached only through the widget bridge:
- `pkg/ipkind`: classifies an address as loopback, private (including 100.64.0.0/10), link-local, multicast, unspecified or public. Only public addresses are ever looked up.
- `pkg/localservices.ListConnections`: TCP connections that have a remote end (listening sockets and TIME_WAIT excluded), with remote classification, owning process and the same Windows name fallback. It opens no connections.
- `pkg/netinfo`: interfaces with addresses, default gateway and a default-route flag (Windows adapter list, lowest metric wins), and the OS's own connectivity assessment from `GetNetworkConnectivityHint`. Gateway latency times one TCP connect (a refusal counts as the host answering), only to the default gateway or a host the widget declared, with a one-second rate limit.
- `pkg/geoip`: offline lookups from a database file read into memory (a memory-mapped file cannot be replaced on Windows). A user-supplied file wins over the downloaded one. Country-only databases return a country code and name; databases with coordinates also return latitude and longitude.
- RPCs: `NetworkConnectionsListCommand`, `NetworkInterfacesCommand`, `NetworkLatencyCommand`, `GeoLookupCommand`. The main process validates widget arguments (`frontend/util/extwidgetargs.ts`) before the backend validates them again.
- New Go modules: `oschwald/maxminddb-golang/v2` (ISC, reader), `maxmind/mmdbwriter` (Apache-2.0 or MIT, tests only), `go4.org/netipx` (indirect). The Go language version was not changed.

Checked live through the self-test widget with a generated test database, a local mock server and a held connection:
- Interfaces: connectivity "internet" from the OS, 13 interfaces. Connections: 133 rows, including both ends of the test connection.
- Geo lookup: the test address returned its country; private and loopback addresses were classified and not looked up; an unknown public address was "not found"; an invalid value was marked invalid; oversized or control-character input was refused by the main process.
- Latency: the default gateway answered in about 1 ms; an immediate second call was refused by the rate limit; hosts that were not declared, including loopback, were refused.

Automated tests added: 84 Go and frontend tests across the packages above, using real loopback TCP (IPv4 and IPv6 established pairs), a generated `.mmdb`, synthetic adapter lists, and a fake dialer for timeouts and refusals.

Not done in E1: importing a user's own `.mmdb` through a host dialog (the file location is supported), and the download of the real DB-IP database (E3).

## 9c. Phase E2 results (2026-10-22)

The widget is `widgets/network-globe` (TypeScript in `src/`, bundled to one `main.js` by esbuild in `scripts/build-widgets.cjs`; about 620 KB including three.js).

What it does:
- **Status bar:** connectivity from the OS (ONLINE, LOCAL NETWORK ONLY, OFFLINE, UNKNOWN), the default interface, its addresses and gateway, a **Measure latency** button (gateway only), Refresh, a Live toggle and Settings.
- **Globe:** a dotted-land sphere (Natural Earth 110m, about 8,600 points generated once by `scripts/generate-globe-assets.cjs`), a graticule, an atmosphere glow, two tilted orbit rings with decorative satellites, drag to rotate, auto-rotation, a pin per remote address (size grows with the number of connections), arcs from your pin with a moving packet dot, and a pulsing marker for you. Selecting a row turns the globe to that pin and highlights its arc.
- **Table and details:** every active connection (process, remote endpoint, state, country) sorted placed, not placed, then local; arrow keys, Enter and Escape work; the details panel shows remote, place, state, local endpoint, process, program path and how many connections share the address.
- **Your pin:** a manual latitude and longitude from Settings, or a rough position from the time zone (labelled "approximate, from your time zone"). Nothing is looked up.
- **Locations:** public remote addresses are resolved through the host's offline lookup. Country-only databases are placed at Natural Earth country label positions with a small fixed spread; databases with coordinates are used as given. Private, loopback and link-local peers appear in the table as "local network" or "this computer" and are never placed.
- **States:** no database installed shows a plain notice and still lists connections; WebGL unavailable (or `?renderer=2d`) shows a flat map with the same pins and arcs.
- **Settings:** Live, hide addresses (masks table, details and status for screenshots), decorative orbits, motion (follow the system or always off), manual location. Saved through the host's per-widget settings file.
- **Performance rules:** 30 frames per second cap (measured 30.0), at most 300 pins and 100 arcs, no frames while the page is hidden (the frame loop is unit tested), and with motion off the globe redraws only when something changes (live check: 47 frames, 1 render in 2.5 s).

Checked live with a generated test database that assigns each public /8 to a test country, so the machine's real connections get pins: 53 pins and arcs from 157 rows, selection details, hide addresses, motion off, the flat map, and the no-database notice and recovery. The country names in that run are test data, not real locations.

Automated tests (20 new): projection and arc math, time zone lookup, pin spreading, grouping and capping, masking, connectivity labels, settings validation and the frame loop's cap, hidden pause and resume.

Data and licenses: three.js 0.170.0 (MIT, new dev dependency), Natural Earth and the IANA tz database (public domain). npm rewrote part of `package-lock.json` when adding three.js, dropping optional entries for other platforms' sharp builds.

Not done in E2: the real DB-IP download and its release (E3), importing your own database through a dialog (E3), a public IP lookup button (E3), a headless render test in CI (the 3D scene was checked by hand and through the live frame and pin counters), light theme visual review, and touch-sized controls.

## 10. Open items and risks

| Item | Note |
|---|---|
| Country vs city database | Starting with country level (a few MB, enough for pins). City level can be added by a new manifest entry if wanted |
| Licensing | Reimplement; check the ENCOM license before reusing anything; keep DB-IP attribution visible |
| Privacy of screens | A globe full of remote addresses is easy to share by accident; addresses are in the table, with a hide toggle |
| GPU load | Constant 3D animation on weak or remote machines; 30 fps cap, pause when hidden, reduced-motion mode, 2D fallback |
| Windows-first | Gateway detection, connectivity state and process names use Windows APIs; other platforms show a notice, as with Local Services |
| Contract creep | Keep v1 to the capabilities listed; add others when a second widget needs them |
| User-supplied widgets | Still deferred; needs its own security review |

## 11. Done when

- The widget loads from its manifest through the generic `extwidget` host, with its own session and no access to the auth key.
- With the widget open and idle, a startup capture shows no non-loopback traffic.
- The first-use download prompt works, verifies the hash, and declining leaves a working widget.
- The globe shows your connections as pins and arcs when a database is installed, and a clear empty state when it is not.
- All tests in section 9 E0 to E3 pass in the repository test script.
- The docs and allowlist match what the widget does.
