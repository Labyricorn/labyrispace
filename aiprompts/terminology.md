# Terminology

The code identifiers are the official terms. This file defines what each one means, so docs and conversation use them the same way.

## The terms

| Term | What it is | Where it lives |
|---|---|---|
| **defwidget** | A shipped sidebar launcher entry. Key form `defwidget@<name>`; surfaces as `defaultwidgets` in the full config. It only opens something; it is not a tier. | `pkg/wconfig/defaultconfig/widgets.json` |
| **block** | Anything placed in the layout, whichever kind created it. | `BlockRegistry`, layout code |
| **view** | The renderer type of a block (`term`, `preview`, `web`, `sysinfo`, `localservices`, `processviewer`, `extwidget`, `tsunami`, `vdom`). The first-party views are the **core views**; there is no separate code name for that tier. | `frontend/app/view/*`, `frontend/app/block/blockregistry.ts` |
| **extwidget** | A sandboxed extension with a `manifest.json`, loaded as separate files. One shared view (`extwidget`) hosts every extension; a defwidget selects one with `ext:id`. | `widgets/<id>/`, `emain/emain-extwidget.ts`, `frontend/util/extwidgetmanifest.ts` |
| **laspapp** | A Tsunami app: a Go program built from `app.go` and run as its own process. Draft and local namespaces; Publish moves draft to local. | `<home>/laspapps/<namespace>/<name>`, `pkg/laspappstore`, `pkg/laspapp`, `tsunami/` |

## Shorthand

| Shorthand | Full term | Note |
|---|---|---|
| **core** | core view | First-party view compiled into the app; no separate code identifier |
| **app** | laspapp | Plain "app" always means a Tsunami app |
| **xapp** | extwidget | Sandboxed extension |
| **link** | defwidget | A launcher entry that points at something and opens it: a core view, an xapp, an app, or a CLI in a terminal. Not an app itself. "Link" never means a hyperlink or symlink in this project's docs; write "URL" or "symlink" for those |

## What each can reach

| | Core view | extwidget | laspapp |
|---|---|---|---|
| Runs as | Main window code | Sandboxed page | Native process |
| Backend access | Full RPC (`RpcApi`) | Only manifest capabilities through the `labyrispaceWidget` bridge | No app RPC credentials found; whole OS as your user |
| Network | Unrestricted | Own files plus declared hosts | Unrestricted |
| Update path | Frontend rebuild | Files loaded at launch | Draft, Publish, recompile |
| Review gate | Git | Git plus manifest | Publish button only |

extwidget capabilities today: `settings`, `theme`, `network.connections`, `network.interfaces`, `network.geolookup`, `network.latency`, `network.trace`, `network.publicip`, `geo.import`.

## Notes

- A defwidget can open any kind. `defwidget@network-globe` opens an extwidget, `defwidget@terminal` opens a core view, and `defwidget@hermes` opens a terminal block running the `hermes` CLI (no extension or app involved).
- "wsh" is not a tier. It is a CLI that runs inside terminal blocks and talks to the app over RPC.
- Prefer the code names above in new docs and comments. Avoid bare "widget" and "plugin" (the latter collides with Claude Code plugins).
- Sources: `emain/emain-extwidget.ts`, `pkg/blockcontroller/tsunamicontroller.go`, `pkg/laspappstore/laspappstore.go`.
