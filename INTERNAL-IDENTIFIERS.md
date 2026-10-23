# Internal Lasp identifiers and retained upstream boundaries

Labyrispace is a hard fork of Wave Terminal v0.14.5. Visible names, the app ID, and the default data folders are Labyrispace's, and internal code, packages, files, and runtime identifiers use the `lasp` abbreviation (`lasp` / `Lasp` / `LASP`). Only external Go/npm package URLs, vendor-block rules, and legal attribution retain upstream `wave` names.

## Build and code identity

| Identifier | Where | Notes |
|---|---|---|
| Go module path `github.com/Labyricorn/labyrispace` | `go.mod`, `tsunami/go.mod`, and all internal Go imports | Local module path; external dependencies `github.com/wavetermdev/htmltoken` and `github.com/wavetermdev/ssh_config` remain pinned to their upstream module paths in `go.mod`/`go.sum` |
| npm package `name: "laspterm"` | `package.json` | Internal; `productName` and `appId` are Labyrispace |
| Backend binary `laspsrv`, helper `wsh`, CLI docs in `cmd/wsh` | `dist/bin`, `cmd/`, Electron spawn paths | The backend is built as `laspsrv`; the shell helper remains `wsh` |
| Source names such as `LaspBrowserWindow`, `laspai-model.tsx`, `laspconfig`, `LaspEnv`, `pkg/laspbase`, `pkg/laspobj` | `emain/`, `frontend/`, `pkg/` | Replaced `wave` with `lasp` across directories, files, and code symbols |

## Runtime contracts

| Identifier | Notes |
|---|---|
| Environment variables `LASPTERM_HOME`, `_CONFIG_HOME`, `_DATA_HOME`, `_AUTH_KEY`, `_TABID`, `_BLOCKID`, `_WORKSPACEID`, `_CLIENTID`, `_CONN`, `_JWT`, `_PUBLICKEY`, `_VERSION`, `_DEV`, `_DEV_VITE`, `_NOCONFIRMQUIT`, `_WSHFORCEUPDATE`, `_APP_PATH`, `_RESOURCES_PATH`, `_ELECTRONEXECPATH` | Read by the helper, shell integration, and the dev scripts. `LASPTERM_LASPAI_ENDPOINT` is accepted but ignored by policy |
| Files and sockets `lasp.lock`, `lasp.sock`, `lasp-remote.sock`, `secrets.enc`, `laspterm.db` in the `db/` folder | Inside the `labyrispace` data folders |
| Remote helper path `~/.laspterm` on remote machines | `RemoteLaspHomeDirName` in `pkg/laspbase` |
| JWT issuer `laspterm`, auth header `X-AuthKey` | Internal RPC authentication |
| Monaco schema URIs `lasp://schema/...` and backend routes `/lasp/...` | Editor validation and local backend HTTP routes |

## Configuration and data

| Identifier | Notes |
|---|---|
| Settings keys `laspai:*`, `lasp:*`, `web:*`, `term:*` and the files `settings.json`, `laspai.json`, `widgets.json`, `connections.json`, `backgrounds.json` | Configuration files in the `labyrispace` config folder |
| AI mode ids and view types (`laspai`, `laspconfig`, `vdom`, `tsunami`) | Stored in user layouts and chats |
| Vendor-block rules (`*.waveterm.dev`, `github.com/wavetermdev/*`) | Kept in `pkg/vendorpolicy`, `frontend/util/vendorpolicy.ts`, `testdata/vendor-urls.json`, and `network-allowlist.json` so Wave vendor hosts remain blocked |

## Attribution (never remove)

`LICENSE`, `NOTICE`, `README.upstream.md`, `ACKNOWLEDGEMENTS.md`, the "Command Line Inc" copyright headers, the modification notices in changed files, and the upstream acknowledgement in the About dialog.

## Wave artwork still in the repository

`assets/wave-*`, `assets/waveterm-logo-*`, and the docs-site logos under `docs/static/img`. They are used only by the preserved upstream README and the docs site, not by the application.
