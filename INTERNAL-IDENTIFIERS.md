# Deliberate Wave-derived identifiers

Labyrispace is a hard fork of Wave Terminal v0.14.5. Visible names, the app ID, and the default data folders are Labyrispace's. The names below are kept on purpose because renaming them touches compatibility, the shell helper protocol, or hundreds of files with no user-facing benefit. Rename one only as its own reviewed change.

## Build and code identity

| Identifier | Where | Why kept |
|---|---|---|
| Go module path `github.com/wavetermdev/waveterm` | `go.mod`, imported by about 245 Go files | Renaming rewrites every import; no external consumers |
| npm package `name: "waveterm"` | `package.json`, `package-lock.json` | Internal; `productName` and `appId` are already Labyrispace |
| Backend binary `wavesrv`, helper `wsh`, CLI docs in `cmd/wsh` | `dist/bin`, `cmd/`, Electron spawn paths | The helper is installed on remote hosts and referenced by shell integration |
| Source names such as `WaveBrowserWindow`, `waveai-model.tsx`, `waveconfig`, `WaveEnv` | `emain/`, `frontend/` | Internal naming |

## Runtime contracts

| Identifier | Notes |
|---|---|
| Environment variables `WAVETERM_HOME`, `_CONFIG_HOME`, `_DATA_HOME`, `_AUTH_KEY`, `_TABID`, `_BLOCKID`, `_WORKSPACEID`, `_CLIENTID`, `_CONN`, `_JWT`, `_PUBLICKEY`, `_VERSION`, `_DEV`, `_DEV_VITE`, `_NOCONFIRMQUIT`, `_WSHFORCEUPDATE`, `_APP_PATH`, `_RESOURCES_PATH`, `_ELECTRONEXECPATH` | Read by the helper, shell integration, and the dev scripts. `WAVETERM_WAVEAI_ENDPOINT` is accepted but ignored by policy |
| Files and sockets `wave.lock`, `wave.sock`, `wave-remote.sock`, `secrets.enc`, the `db/` folder | Inside the `labyrispace` data folders |
| Remote helper path `~/.waveterm` on remote machines | `RemoteWaveHomeDirName` in `pkg/wavebase`; existing remote installs rely on it |
| JWT issuer `waveterm`, auth header `X-AuthKey` | Internal RPC authentication |
| Monaco schema URIs `wave://schema/...` | Editor validation only |

## Configuration and data

| Identifier | Notes |
|---|---|
| Settings keys `waveai:*`, `wave:*`, `web:*`, `term:*` and the files `settings.json`, `waveai.json`, `widgets.json`, `connections.json`, `backgrounds.json` | Format shared with the import feature for Wave profiles |
| AI mode ids and view types (`waveai`, `waveconfig`, `vdom`, `tsunami`) | Stored in user layouts and chats |
| Telemetry event names and the inert telemetry/activity RPC handlers | Backend compatibility only; nothing calls or uploads them |

## Attribution (never remove)

`LICENSE`, `NOTICE`, `README.upstream.md`, `ACKNOWLEDGEMENTS.md`, the "Command Line Inc" copyright headers, the modification notices in changed files, and the upstream acknowledgement in the About dialog.

## Wave artwork still in the repository

`assets/wave-*`, `assets/waveterm-logo-*`, and the docs-site logos under `docs/static/img`. They are used only by the preserved upstream README and the docs site, not by the application.
