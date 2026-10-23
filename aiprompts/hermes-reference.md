# Hermes Agent Reference

Baseline for the work in `hermes_integration_implementation_plan.md`.

## Source studied

- Repository: https://github.com/NousResearch/hermes-agent
- License: MIT, Copyright (c) 2025 Nous Research (confirmed from the `LICENSE` file in the clone)
- Pinned commit: `db1fa153fe24a051af44ef8ee862b93e27998060` (2026-10-23)
- Local read-only checkout: `G:\.vibe\reference\hermes-agent` (outside this repo, shallow clone)
- Installed locally: Hermes Agent v0.21.6, home `C:\Users\cgcha\AppData\Local\hermes`

The Hermes model weights are licensed separately from the agent. Check the model card of whichever model is used.

## This fork's base

- WaveTerm-derived; `package.json` version `0.14.5`.
- Dev config directory resolves to `~/.config/labyrispace-dev` (prod: `~/.config/labyrispace`), see `getLaspConfigDir` in `emain/emain-platform.ts`.

## Phase 2 findings (verified in this repo)

- `ai:endpoint` is used verbatim as the POST URL (`pkg/aiusechat/openaichat/openaichat-convertmessage.go`), so it must be the full path: `http://127.0.0.1:8642/v1/chat/completions`.
- Auth is sent as `Authorization: Bearer <token>`. If `ai:apitokensecretname` is set, the secret must exist and be non-empty, otherwise the request fails (`pkg/aiusechat/usechat.go`).
- The built-in default modes were empty (`{}`), so Hermes is the only shipped mode.
- Hermes API server settings (`API_SERVER_ENABLED`, `API_SERVER_KEY`, `API_SERVER_PORT`, `API_SERVER_HOST`, `API_SERVER_MODEL_NAME`) are documented in `website/docs/user-guide/features/api-server.md` of the clone. Default bind is `127.0.0.1:8642`, model name `hermes-agent`.

## Setup steps (manual)

1. In the Hermes home `.env`, set `API_SERVER_ENABLED=true` and `API_SERVER_KEY=<long random value>`.
2. Run `hermes gateway`.
3. In Labyrispace, store the same value as the secret `HERMES_KEY`.
4. Pick the Hermes mode in the AI panel.

## Gateway test (2026-10-23)

- `API_SERVER_ENABLED` and a generated `API_SERVER_KEY` were appended to the Hermes home `.env`; `hermes gateway run` serves on `127.0.0.1:8642`.
- `GET /health` returns ok; chat completions without the key return 401.
- Streaming and non-streaming responses follow the standard OpenAI chat format, ending with `data: [DONE]`.
- With a provider configured (local model, 64K+ context required by Hermes), both streaming and non-streaming replies return the expected text ("pong").
- A trivial one-line prompt used about 15K prompt tokens: Hermes sends a large system prompt and toolset on every request. Expect this overhead on every turn.
- Non-streaming replies include a `reasoning_content` field alongside `content`.

## Still unverified

- Streaming and tool-progress output from the gateway through the `openaichat` client (wire format checked with curl only).
- Whether the AI panel picks a default mode from `display:order`.
- Whether the `hermes` command resolves on the app's PATH when a block starts.
