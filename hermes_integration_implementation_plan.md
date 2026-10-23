# Hermes Integration Implementation Plan

Goal: use Hermes Agent as the Labyrispace assistant now, and extract its behavior (memory, skills, loop control, context management) into the native Go agent in `pkg/aiusechat` one capability at a time.

Hermes Agent: https://github.com/NousResearch/hermes-agent (Python, MIT per secondhand sources; confirm `LICENSE` in Phase 0).

## Ground rules

- Port **ideas and prompts**, not Python code. Keep the MIT notice for anything copied or closely adapted (see `THIRD_PARTY_NOTICES.md` task in Phase 0).
- Each phase ships independently and leaves the app working.
- Follow project rules in `.kilocode/rules/rules.md` (Go: string consts, `Make*` constructors, lock helpers; TS: Jotai models, 4-space indent). Config additions follow `.kilocode/skills/add-config/SKILL.md`; RPC additions follow `add-rpc`.
- Nothing here is verified against Hermes source yet. Module names below come from the repo's top-level listing and are **hypotheses** until Phase 1 confirms them.

## Current state of the native agent (verified)

| Area | Where | Notes |
|---|---|---|
| Agent loop | `pkg/aiusechat/usechat.go` (`RunAIChat`, `runAIChatStep`, `processAllToolCalls`) | Step loop with tool-call resolution and approval (`toolapproval.go`) |
| Prompts | `pkg/aiusechat/usechat-prompts.go` | Static string slices; no per-user or per-project layering |
| Chat storage | `pkg/aiusechat/chatstore/chatstore.go` | In-memory map under a mutex; **no persistence, no cross-session recall** |
| Tools | `pkg/aiusechat/tools*.go` | Screenshot, read/write file, read dir, terminal scrollback, web, tsunami/builder |
| Modes/config | `pkg/aiusechat/usechat-mode.go`, `pkg/wconfig/settingsconfig.go` (`AIModeConfigType`), `~/.laspterm/config/laspai.json` | Providers: lasp, openai, openrouter, google, azure, custom |
| Providers | `pkg/aiusechat/{openai,openaichat,anthropic,gemini,google}` | `openai-chat` client usable for Hermes's API server |
| Frontend | `frontend/app/aipanel/*` | `laspai-model.tsx` is the model |

Gaps relative to what Hermes advertises: persistent memory, skills, context compression, session search, layered persona/project instructions.

---

## Phase 0: Preparation and license check

Deliverable: a clean baseline and a legal paper trail.

- [ ] Read `LICENSE` in the Hermes repo; record the license and commit hash you studied in `aiprompts/hermes-reference.md`.
- [ ] Add `THIRD_PARTY_NOTICES.md` (or extend an existing one) with Hermes's copyright notice, to be used if any text is copied.
- [ ] Record the WaveTerm base version of this fork (about 0.14.5) so upstream diffs stay possible.
- [ ] Confirm the Hermes model/weights license separately if any model is bundled or recommended.
- [ ] Clone Hermes to a scratch location **outside** this repo for reading (`G:\.vibe\reference\hermes-agent`).

Exit criteria: license confirmed, reference checkout pinned to a commit.

## Phase 1: Extraction (read-only research)

**Status: done (docs-level).** See `aiprompts/hermes-behavior-spec.md`. It was built from Hermes's developer docs plus spot checks in code; a code-level pass on the items in its "Open questions" section is still open. It also revises the port order and adds a prerequisite: add the `sqlite_fts5` build tag before session search.

Deliverable: `aiprompts/hermes-behavior-spec.md`, a plain-language spec of how Hermes behaves, with file references. No code changes.

Subsystems to document, with starting-point guesses to confirm:

| Subsystem | Starting hypothesis | Questions to answer |
|---|---|---|
| Agent loop | `agent/`, `cli.py` | Stop conditions, max iterations, retry/backoff, tool-error handling, parallel tool calls, interruption |
| Prompt assembly | `SOUL.md`, `AGENTS.md`, code in `agent/` | Layer order (persona, project, memory, skills, tools), size budgets, caching |
| Memory | `hermes_state*.py`, `hermes_state_fts.py` | What is stored, who decides (agent vs. user), schema, how recall is injected, eviction |
| Session search | `hermes_state_fts.py`, `native/fts5_cjk/` | SQLite FTS5 usage, ranking, what gets indexed |
| Context compression | `hermes_state_compression.py` | Trigger threshold, what is summarized, what is preserved verbatim |
| Skills | `skills/`, `optional-skills/` | File format (agentskills.io), discovery, when loaded, how the agent authors a new skill |
| Tool registry | `tools/` | Toolset grouping, per-platform enablement, approval model |
| Safety | `SECURITY.md`, tool approval code | Command approval, sandboxing, secret handling |

Method: read the developer docs at `website/docs/developer-guide/architecture` first, then the modules. For each subsystem record: purpose, data model, algorithm, prompts (verbatim only for your private notes), and **port difficulty** (S/M/L).

Exit criteria: the spec exists and every later phase links to a section of it.

## Phase 2: Hermes as the assistant (sidecar, no new Go code)

Deliverable: Hermes selectable in the AI panel, plus a terminal launcher.

- [ ] Enable the Hermes API server (`API_SERVER_ENABLED`, `API_SERVER_KEY` in `~/.hermes/.env`), run `hermes gateway`, endpoint `http://127.0.0.1:8642/v1`.
- [ ] Add a `custom@hermes` mode to `laspai.json`:
  - `ai:provider`: `custom`, `ai:apitype`: `openai-chat`, `ai:model`: `hermes-agent`
  - `ai:endpoint`: verify the expected form in `pkg/aiusechat/openaichat` (base URL vs. full path)
  - `ai:apitokensecretname`: `HERMES_KEY`
  - leave `ai:capabilities` empty so Hermes uses only its own tools
- [ ] Verify against the running gateway: streaming text, a tool-using turn, error handling when the gateway is down, empty/dummy token behavior.
- [ ] Add a terminal-block launcher preset that runs `hermes` in the current directory and connection.
- [ ] Decide how to start the gateway (manual first; later a managed process).
- [ ] Decide default-mode selection (find where the default is chosen; may be `display:order`).

Known limits to record in the spec: Hermes acts on its own host/cwd, not the focused block; Lasp's block-aware tools are not available to it.

Exit criteria: you can chat with Hermes from the AI panel and open the Hermes TUI in a block.

## Phase 3: Persistence foundation for the native agent

Deliverable: chats and agent data survive restarts. Prerequisite for memory and session search.

- [ ] Choose storage: extend `pkg/filestore` / `wstore` (existing SQLite) vs. a new `agent.db`. Prefer the existing SQLite stack to avoid a new dependency; check FTS5 availability in the Go SQLite driver in use.
- [ ] Add a persistent chat store behind the existing `ChatStore` API in `pkg/aiusechat/chatstore` (keep `Get`, `PostMessage`, `RemoveMessage` signatures).
- [ ] Schema: `chats`, `messages`, with timestamps and mode name.
- [ ] Expose list/load/delete through RPC (`add-rpc` skill) and a minimal history UI in `frontend/app/aipanel`.

Exit criteria: restart the app and prior chats are listed and loadable.

## Phase 4: Layered prompts

Deliverable: persona and project instructions assembled in layers instead of one static string.

- [ ] Refactor `usechat-prompts.go` into ordered layers: base rules, persona, project instructions, tab state, memory (Phase 5), skills index (Phase 6).
- [ ] Persona file in `~/.laspterm/config/` (analogue of `SOUL.md`); project instructions read from `AGENTS.md`/`CLAUDE.md` in the focused block's cwd when available.
- [ ] Add config keys for enabling each layer (`add-config` skill).
- [ ] Add a size budget per layer with truncation rules taken from the Phase 1 spec.
- [ ] Fix stale prompt text in `SystemPromptText_OpenAI` (it says commands cannot be run, but terminal tools exist; reconcile with `tools_term.go`).

Exit criteria: prompt layers are unit-tested for ordering and truncation.

## Phase 5: Memory

Deliverable: the agent can remember and recall across sessions.

- [ ] Data model from the Phase 1 spec (likely: short curated facts about the user/environment, plus searchable past sessions).
- [ ] Tools: `memory_save`, `memory_list`, `memory_forget`, `session_search` registered in `pkg/aiusechat/tools.go` with approval rules (saving is low risk; forgetting needs confirmation).
- [ ] Recall: inject top-N relevant memories into the prompt layer from Phase 4; use FTS5 for session search.
- [ ] UI: a memory viewer/editor so the user can inspect and delete what the agent stored.
- [ ] Never store secrets; add a filter for obvious token/key patterns before saving.

Exit criteria: a fact told in one chat is correctly recalled in a new chat, and is visible and deletable in the UI.

## Phase 6: Skills

Deliverable: reusable procedures the agent can load and author.

- [ ] Skill format: markdown with frontmatter, compatible with the standard Hermes uses (agentskills.io) if the spec confirms it, and similar to this repo's `.kilocode/skills`.
- [ ] Storage: `~/.laspterm/skills/` plus per-project `.laspterm/skills/`.
- [ ] Prompt injection: only a compact index (name and description) in the prompt; full body loaded via a `skill_load` tool on demand.
- [ ] Authoring: `skill_save` tool, gated by user approval, with a diff preview in the panel (reuse the approval flow in `toolapproval.go`).
- [ ] Ship two or three starter skills for Labyrispace workflows.

Exit criteria: the agent loads a skill by name and, with approval, writes a new one.

## Phase 7: Context compression

Deliverable: long chats stay within the model's context window.

- [ ] Token estimation per message (use provider usage data already collected in `AIUsage`).
- [ ] Trigger and algorithm from the Phase 1 spec: summarize older turns, keep recent turns and tool results the spec marks as preserved.
- [ ] Run the summarization as an extra model step in `RunAIChat` before `runAIChatStep` when over threshold.
- [ ] Surface compression in the UI (a collapsed "earlier conversation summarized" marker).
- [ ] Tests with synthetic long chats; verify tool-call/tool-result pairs are never split.

Exit criteria: a 200-turn synthetic chat completes without a context overflow, and tool pairs stay intact.

## Phase 8: Loop control and robustness

Deliverable: loop behavior matching the best of what Phase 1 found.

- [ ] Max-iteration cap and budget limits per turn.
- [ ] Retry/backoff for transient provider errors (compare with `runAIChatStep`).
- [ ] Better tool-error recovery prompts; parallel tool execution where safe.
- [ ] User interruption that stops cleanly between steps.
- [ ] Review tool approval against Hermes's approval model; keep Labyrispace's stricter default for file writes.

Exit criteria: failure-injection tests (provider 500, tool timeout, cancel mid-stream) behave predictably.

## Phase 9: Decide the long-term shape

Deliverable: a short decision record in `aiprompts/hermes-decision.md`.

Compare, using real usage from Phases 2 to 8:

| Option | Pros | Cons |
|---|---|---|
| Hermes sidecar only | Full behavior, zero maintenance of agent logic | Second agent, no block awareness, Python dependency |
| Native agent only | One agent that knows the app | You maintain it; lags Hermes features |
| Hybrid (native by default, Hermes as optional mode) | Best of both | Two code paths to support |

Also decide whether to add a block-aware bridge so Hermes can read terminal blocks (for example through `wsh` commands or an MCP server exposing Labyrispace tools).

---

## Risks

- **Spec drift:** Hermes changes quickly; the behavior spec pins a commit, and re-syncs are deliberate, not automatic.
- **Prompt portability:** prompts tuned for one model family may behave differently on others; test each ported prompt on every supported provider.
- **Two agents acting at once:** the sidecar mode and native tools can overlap; keep native tools disabled for the Hermes mode.
- **Data sensitivity:** memory and session search store user data on disk; keep it local, visible, deletable, and out of telemetry.
- **Windows:** the Hermes gateway runs on Python; confirm install and run on Windows (or WSL) before relying on it.

## Suggested order and sizing

| Phase | Effort | Depends on |
|---|---|---|
| 0 Preparation | S | none |
| 1 Extraction | M | 0 |
| 2 Sidecar | S | 0 |
| 3 Persistence | M | none |
| 4 Layered prompts | S | 1 |
| 5 Memory | L | 1, 3, 4 |
| 6 Skills | M | 1, 4 |
| 7 Compression | M | 1, 3 |
| 8 Loop control | M | 1 |
| 9 Decision | S | 2 to 8 |

Phases 0 to 2 can start immediately and in parallel. Phase 2 gives you a working Hermes assistant while the rest is researched and built.
