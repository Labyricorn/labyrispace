# Network Globe widget (eDEX-UI inspired): implementation plan

Status: plan for approval. Nothing here is implemented. Prepared 2026-10-22 against commit `11681fe`.

This widget is two things at once: a rebuild of eDEX-UI's network panel and rotating globe, and **the first external widget**, which means it also defines the small contract that later external widgets use. Both parts are covered below.

## 1. What eDEX-UI does today (from its source)

Read from `G:\.vibe\edex-ui-labyricorn` (`src/classes/netstat.class.js`, `locationGlobe.class.js`, `conninfo.class.js`).

| Feature | How eDEX-UI does it | Network behavior |
|---|---|---|
| Network status panel (state, local IPv4, ping, interface name) | `systeminformation` interface list; picks the default-route interface | Pings `1.1.1.1:80` by TCP connect **every 2 seconds** |
| Public IP and location | HTTPS call to `myexternalip.com`, then a GeoIP lookup | External call about every 20 seconds while online |
| GeoIP database | `geolite2-redist` downloads GeoLite2-City into the user data folder at startup | External download |
| Rotating globe | Vendored fork of arscan's ENCOM Globe (about 1 MB bundle) plus a 960 KB land-tile file | None |
| Connection pins and routing | Every 3 seconds, lists ESTABLISHED connections, geolocates each peer address, adds a pin and a connection marker | None beyond the lookups above |
| "Satellites" | **Decorative**: six satellites at random positions and altitudes each launch (`addConstellation`). They are not tracked real satellites | None |
| Traffic charts | `networkStats` for the active interface | None |

Three of those behaviors conflict with Labyrispace's rules (no network at startup, explicit actions only): the 2-second ping, the public-IP call, and the database download. The plan keeps the visuals and changes where the data comes from.

## 2. Licensing decision (read this first)

- eDEX-UI is **GPL-3.0** (`LICENSE`, `package.json`). Labyrispace is **Apache-2.0**. Code copied from eDEX-UI would pull the combined work under the GPL, and the eDEX contributors, not only the fork owner, hold that copyright.
- The vendored globe is a fork of ENCOM Globe by Rob Scanlon. Its own license must be checked before any reuse; this plan does not assume it.
- **Plan: treat eDEX-UI as a functional reference only.** Write the widget from scratch using permissive dependencies:
  - three.js (MIT) for rendering.
  - Natural Earth land data (public domain) to generate the dotted land map at build time.
  - `maxminddb-golang` (ISC) for GeoIP lookups, if the user supplies a database.
- This is an engineering recommendation, not legal advice. Confirm before copying anything else from eDEX-UI.

## 3. What the widget does

1. **Network status panel.** State, interface name, local IPv4 and IPv6 for the default-route interface, gateway. All from the local OS, no traffic.
2. **Rotating globe.** A dotted-land sphere that turns slowly, with decorative orbit rings and satellites. Satellites are illustrative and labelled so in settings; real tracking (public orbital data plus SGP4) is a later opt-in, see section 9.
3. **Connection pins and routing arcs.** Each established connection's remote address is geolocated offline and drawn as a pin with an animated arc from your location. Click a pin or row for details: remote address and port, state, owning process, country.
4. **Local-only markers.** Private, loopback and link-local peers are listed as "local network" and not placed on the globe.
5. **Explicit network actions** (buttons, off by default, section 7): look up public IP, measure latency to a chosen target.

## 4. The external widget contract (version 1, deliberately small)

"External" means the widget is a separate package with its own manifest, built outside the app core, and run in isolation. It does not share the app's code, state, or browser session.

### 4.1 Package layout

```
widgets/network-globe/
  manifest.json
  src/             (TypeScript, three.js)
  assets/          (land-dots.json, icons, licenses)
  build output -> dist/widgets/network-globe/
```

Bundled with the application at build time. No downloader, no marketplace and no user-folder scanning in v1 (those stay deferred, as in `implementation_plan.md`).

### 4.2 Manifest fields

| Field | Purpose |
|---|---|
| `id`, `name`, `version` | Stable id (`network-globe`), display name, widget version |
| `hostApi` | Host API version range the widget needs; load is refused if incompatible |
| `entry` | HTML entry inside the package |
| `capabilities` | Host services the widget may call: `network.connections`, `network.interfaces`, `network.geolookup`, `settings`, `theme` |
| `network` | Allowed outbound destinations with a purpose each. Default: none |
| `license`, `attribution`, `sourceCommit` | Provenance, shown in a details view |
| `settings` | Optional schema for the widget's own settings |

### 4.3 How the host runs it

- A single new built-in view, `extwidget`, hosts any external widget. It reads `ext:id` from the block metadata, validates the manifest, then loads the entry in a `<webview>`.
- Each widget gets its own session partition, for example `persist:labyrispace-ext-network-globe`. This builds on the security fix: guest content never shares the app session and never receives the backend auth key.
- The widget talks to the host only through a small preload bridge (`window.labyrispaceWidget`). Each call goes to the main process, which looks up the calling widget by its webContents id and checks the manifest's `capabilities`. Undeclared calls are refused. The bridge never exposes the auth key, file paths, or arbitrary RPC.
- **Network enforcement:** a request filter on the widget's partition cancels any request that is not on the manifest's `network` list. With the default empty list the widget cannot reach the Internet at all. This turns the manifest declaration into an enforced rule for this widget, not just documentation.
- Lifecycle: the host destroys the webview on block close; the widget gets `dispose` and visibility events so it can stop animation when hidden. A crashed or failed widget shows an error panel; terminals and other widgets keep working (same isolation behavior verified for unknown views in Phase 5).
- The sidebar entry is an ordinary `widgets.json` item whose block definition is `{ "view": "extwidget", "ext:id": "network-globe" }`.

## 5. Host services the widget uses

All run locally in the Go backend and are reached only through the bridge. Each is a read-only RPC.

| Service | Source | Notes |
|---|---|---|
| `network.interfaces` | gopsutil interfaces plus the Windows adapter list for the default gateway | Name, up/down, addresses, gateway, default-route flag |
| `network.connections` | Extension of `pkg/localservices`: `ListConnections` returns non-listening TCP states with remote address, port, state, pid, process name | Same permission model and process-name fallback as Local Services; no connections are opened |
| `network.geolookup` | `maxminddb-golang` over a database file the user selects | IPs never leave the machine. No database means pins are listed but not placed |
| `settings` | A JSON file per widget under the profile's config folder | The widget can read and write only its own namespace |
| `theme` | Current colors and font | Changes are pushed as events |

Geolocation data: GeoLite2 cannot be bundled (its license requires an account and forbids redistribution). Options, in order of preference:

1. User picks a `.mmdb` file in settings; it is copied into the widget's data folder.
2. A country-level DB-IP Lite file (CC BY 4.0) can be bundled later with attribution, giving country-centroid pins with no setup.
3. Neither: the globe still shows your own location if you enter it, and the connection list works.

## 6. Globe and rendering design

- Dotted land: generate about 10,000 to 15,000 points on a sphere from Natural Earth 110m land at build time and store them as a compact JSON file (a few hundred KB). No runtime download.
- Rendering: three.js `Points` for land, an instanced mesh for pins, quadratic Bezier arcs lifted above the surface with an animated dash for packets, a faint atmosphere shell, and thin orbit rings with a few decorative satellites.
- Budgets: 30 fps cap, at most 300 pins and 100 arcs, pause when the widget is hidden (visibility and intersection events), no animation when the OS requests reduced motion (static globe).
- Fallback: if WebGL is unavailable, draw a 2D equirectangular map with the same pins and a notice.
- Refresh: connection list every 3 seconds while visible (local socket-table read only); stop when hidden. A manual Refresh button always works.
- Accessibility: every pin also appears as a row in a table beside the globe; arrow keys move between rows; colors meet contrast needs in both themes.

## 7. Explicit network actions (off by default)

| Action | Destination | Rules |
|---|---|---|
| Look up public IP | A provider URL the user chooses in settings (no default) | Button only; result kept in memory, never saved; added to the manifest `network` list only for the chosen host |
| Latency check | A host:port the user types; the default suggestion is the local gateway, which is not Internet traffic | Button only, no polling |
| Reverse DNS names | Not included in v1 | It is a network lookup; revisit later as a button |
| Real satellite positions | Not included in v1 | Needs orbital data downloads; later opt-in |

The widget's manifest ships with an empty `network` list; choosing a provider adds that one host at runtime through a host-approved settings step. `NETWORK-BEHAVIOR.md` and `network-allowlist.json` get matching entries.

## 8. Work breakdown

**Phase E0: contract and host**
1. Manifest schema, validator, loader, and a compatibility check.
2. `extwidget` view, per-widget partition, bridge preload, capability enforcement in the main process, per-partition request filter.
3. Tests: manifest rejection cases; a call without a declared capability is refused; a request to an undeclared host is cancelled; the widget partition never receives the auth key (reuses the security tests' approach); a broken widget shows an error panel and leaves other blocks alone.

**Phase E1: data services (Go)**
1. `pkg/localservices`: `ListConnections` plus RPCs for connections, interfaces and geo lookup.
2. Tests: real sockets on loopback (TCP established pairs, IPv6), private-range classification, process-exit races, missing identity, no database, a database lookup using a tiny generated `.mmdb`, and a fake resolver interface for the rest.

**Phase E2: the widget**
1. Status panel, table, details view, settings (database file, live refresh, reduced motion).
2. Globe, arcs, pins, orbit decoration, fallback.
3. Tests: pure functions (great-circle arc math, private-address classification, pin capping, ordering) with vitest; a headless render smoke test that the scene builds and the frame loop stops when hidden.

**Phase E3: explicit network actions**
1. Public IP and latency buttons with the runtime host approval step.
2. Tests: nothing is requested until the button is pressed; an unapproved host is cancelled; results are not persisted.

**Phase E4: verification and docs**
1. Run on an isolated profile: startup capture shows no new traffic with the widget open and idle; open connections to local test servers appear as rows; pins appear when a test database maps a test address.
2. Update `NETWORK-BEHAVIOR.md`, `network-allowlist.json`, `INTERNAL-IDENTIFIERS.md` if needed, the Help text, README, and the devlog; commit after each phase, no push without your word.

## 9. Open questions and risks

| Item | Question or risk | Suggested default |
|---|---|---|
| Satellites | Decorative like eDEX-UI, or real tracking? | Decorative in v1, labelled; real tracking later as an opt-in with a visible download step |
| GeoIP source | User-supplied `.mmdb`, or bundle DB-IP Lite country data? | User-supplied first; bundle country data later with attribution |
| Live refresh default | On while visible, or manual only? | On while visible (local reads only), with a toggle |
| Distribution | Bundled only, or also a user widgets folder? | Bundled only in v1; user folder needs its own security review |
| Licensing | OK to reimplement and not reuse eDEX-UI or ENCOM code? | Yes; check the ENCOM license before reusing anything |
| Privacy of screens | A globe full of your remote addresses is easy to share by accident | Show addresses only in the table by default, with a "hide addresses" toggle for screenshots |
| GPU load | A constant 3D animation on a handheld or remote session | 30 fps cap, pause when hidden, reduced-motion static mode, 2D fallback |
| Windows-first | Default-gateway detection and process names use Windows APIs | Windows first; other platforms show a notice, as with Local Services |
| Contract creep | The first external widget invites a big API | Keep v1 to the capabilities listed here; add others when a second widget needs them |

## 10. Done when

- The widget loads from its manifest through the generic `extwidget` host, with its own session and no access to the auth key.
- With the widget open and idle, a startup capture shows no non-loopback traffic.
- The globe shows your connections as pins and arcs when a geolocation database is configured, and a clear empty state when it is not.
- All tests in sections 8 E0 to E3 pass in the repository test script.
- The docs and allowlist match what the widget actually does.
