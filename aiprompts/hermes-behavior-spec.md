# Hermes Agent Behavior Spec

Phase 1 deliverable of `hermes_integration_implementation_plan.md`. A plain-language description of how Hermes Agent behaves, for porting into `pkg/aiusechat`.

- Source: https://github.com/NousResearch/hermes-agent, MIT, commit `db1fa153fe24a051af44ef8ee862b93e27998060` (checkout at `G:\.vibe\reference\hermes-agent`)
- Wording is paraphrased. Prompts are described, not copied. If text is ever copied, keep the notice in `THIRD_PARTY_NOTICES.md`.

## How this was produced, and how far to trust it

Read in full: the developer docs `agent-loop`, `prompt-assembly`, `session-storage` (first 200 lines), `context-compression-and-caching` (about 60%), and the user docs `memory`, `skills` (first 330 lines), `security` (approval sections), `sessions` (session search).
Spot-checked in code: `hermes_cli/config_defaults.py` and the head of `agent/background_review.py` and `agent/curator.py`.
**Not read:** the Python implementation of the loop, compressor, memory tool, skill tools and approval engine. Everything below that is not marked "(code-checked)" comes from the project's own docs, which are detailed but can lag the code.

One doc/code mismatch to resolve before relying on loop limits: the docs say the iteration budget defaults to 500 (`agent.max_turns`), but `config_defaults.py:78` has `"max_turns": None`. A separate `max_turns: 20` at line 1404 is in another section (probably delegation or review). Check `agent/conversation_loop.py` for the real default.

## Scale of the thing

`agent/` is about 130,000 lines of Python; the loop alone is `conversation_loop.py` (about 1,900 lines) plus `turn_*.py` phase files, `tool_executor.py` (about 2,000), `prompt_builder.py` (about 1,800) and `context_compressor.py` (about 5,700). Most of that is provider adapters (Anthropic, Codex, Bedrock), credential pooling, gateway/platform plumbing and cache tuning. **Do not port that.** The ideas worth porting are small. Each section ends with what to take.

---

## 1. Agent loop

**Behavior**
1. Append the user message. Build the system prompt once and reuse it (see section 2).
2. Before each API call, check whether compression is needed (section 6).
3. Convert history to the provider's format; all internal history is OpenAI-style (`system`, `user`, `assistant` with `tool_calls`, `tool` with `tool_call_id`).
4. Add ephemeral per-call layers (budget warnings, context pressure) that are never saved.
5. Make an interruptible API call: the HTTP call runs on a worker while the main side waits on response, interrupt event or timeout. On interrupt the response is discarded and nothing partial enters history.
6. If the reply has tool calls: run them, append results, go back to step 2. Otherwise save the session, flush memory if needed, and return the text.

**Rules worth copying**
- Strict role alternation: never two assistant or two user messages in a row; only `tool` messages may be consecutive. Providers reject malformed histories.
- Multiple tool calls in one reply run concurrently; results are re-inserted in the original call order. Interactive tools (`clarify`) force sequential execution.
- Some tools are handled by the agent itself, not a registry: `todo`, `memory`, `session_search`, `delegate_task`. They change agent state and return synthetic results.
- Iteration budget with a hard stop. At 100% the agent stops and returns a summary of what it did. Subagents get their own smaller budget (default cap 50).
- Fallback providers: on 429, 5xx or 401/403, try the next configured provider (after a credential refresh on 401/403).
- Hooks around each tool call (`pre_tool_call`, `post_tool_call`) and around each model call.

**Lasp today:** `RunAIChat` / `runAIChatStep` in `usechat.go` already has the core loop, tool dispatch (`processAllToolCalls`) and approval. Missing: an iteration cap, fallback provider, concurrent tool execution, explicit interruption between steps.

**Port:** iteration cap with a wrap-up turn; fallback provider list per mode; concurrent execution of independent tool calls preserving order; cancel between steps. **Difficulty: M.**

## 2. Prompt assembly

Hermes builds the system prompt **once per session** and keeps it byte-stable so the provider's prompt cache keeps hitting. Per-call additions never go into it.

Three ordered tiers, joined stable, then context, then volatile:
- **stable:** identity (a user-editable `SOUL.md`, else a built-in default persona), tool and model guidance, platform hint (for example "you are in a terminal, avoid heavy Markdown").
- **context:** an optional caller system message, then one project instruction file, then a git workspace snapshot and operator instructions.
- **volatile:** skills index, frozen memory snapshot (`MEMORY.md`), frozen user profile (`USER.md`), external memory block, timestamp/session/model line, then runtime environment (host, home, current working directory).

Project instruction file lookup, first match wins: `.hermes.md` / `HERMES.md` (walks up to the git root), then `AGENTS.md` (cwd only), then `CLAUDE.md`, then `.cursorrules`. All are scanned for prompt-injection patterns (invisible Unicode, "ignore previous instructions", credential exfiltration) and a hit replaces a project file with a blocked marker. They are truncated to a cap that scales with the model's context window (20,000-char floor).

Things that stay out of the cached prompt and ride on the current user message instead: later-turn recall from external memory, plugin context, a one-shot note when the skills list changes mid-session, or when the user switches surface.

**Lasp today:** `usechat-prompts.go` is two static strings plus a tab-state block. No persona file, no project-file loading, no layering. (Correction: an earlier draft said the prompt wrongly claims commands cannot be run. Lasp has no command-execution tool, only `term_get_scrollback` and `term_command_output`, so that claim is accurate. Phase 4 removed only the stale "coming soon" wording.)

**Port:** layered builder with a size budget per layer; `SOUL.md`-style persona file in the config dir; load `AGENTS.md` / `CLAUDE.md` from the focused block's cwd; injection scan; keep the prompt stable per chat and put changing data in the user turn. **Difficulty: S–M.**

## 3. Persistent memory

**Data:** two small plain-text files per profile, `MEMORY.md` (agent notes: environment, conventions, lessons) and `USER.md` (who the user is, preferences). Entries are separated by a `§` line. Hard character limits: memory 2,200, user profile 1,375 (roughly 800 and 500 tokens). Config: `memory.memory_char_limit`, `memory.user_char_limit`, `memory.write_approval`.

**How it reaches the model:** read at session start and put into the prompt as a **frozen snapshot** with a header showing usage (for example "67% — 1,474/2,200 chars"). Mid-session writes go to disk at once but only show up in the next session, which keeps the prompt cache valid. The tool result always shows live state.

**The `memory` tool:** actions `add`, `patch` (replace one unique span inside an entry), `remove` (by unique substring), batched in an `operations` list, with a required `target` of `memory` or `user`. There is deliberately no read action and no whole-entry `replace` (models used it as find-and-swap and wiped other facts).
- Over the limit: the tool errors and returns the current entries plus how many characters must be freed. The agent then sends one batch that shortens or removes entries and adds the new one; the limit is checked only on the batch result.
- An ambiguous match returns an error asking for a more specific substring. Exact duplicates are ignored.
- Entries are scanned for injection and exfiltration patterns and for invisible Unicode before being accepted.

**What to save:** user preferences, environment facts, corrections, project conventions, completed-work notes, explicit "remember this". **Skip:** trivial or easily rediscovered facts, raw dumps, temporary paths, anything already in project files.

**Write approval:** with `write_approval: true`, writes are held for review (inline in the interactive CLI, staged elsewhere) and applied with `/memory approve`. A staged edit records the exact entry it targets and is refused if that entry changed since.

**Self-improvement loop ("background review"):** after a turn the agent may fork a hidden copy that replays the conversation and asks whether any memory or skill should be saved or updated. It writes straight to the stores through a tool whitelist and never touches the live chat. `nudge_interval` is 10 (code-checked, `config_defaults.py:1321`). It can run on a cheaper model, has an input-token cap per review, and a short notice ("Memory updated") can be shown in chat.

**Known failure mode worth designing around:** small or weak tool-calling models say "saved" without calling the tool. Verify the entry exists; do not trust the sentence.

**Lasp today:** nothing; `chatstore` is an in-memory map.

**Port:** the two-file model with hard limits, the `add`/`patch`/`remove` batch tool with its error contract, the frozen snapshot, an injection scan, and a memory viewer in the UI with delete. Defer the background review to a later step. **Difficulty: M.**

## 4. Session search (episodic recall)

**Data:** every conversation is stored in SQLite (WAL mode) with `sessions` and `messages` tables and FTS5 virtual tables (normal, trigram for substring/CJK, and a CJK tokenizer). Sessions carry source, model, token counts, workspace (`cwd`, git branch), a title, and a parent link used when compression splits a session.

**The `session_search` tool** makes no model calls. It infers its mode from which arguments are set:
1. **Discovery** (`query`): FTS5 search, results deduplicated by session lineage, top N sessions. The best hit includes ±5 messages of context plus the first and last 3 messages of the session; lower hits are compact. Supports phrases, `OR`, `NOT` and prefix `deploy*`; options for sort (`newest`/`oldest`), detail, and `role_filter` (default `user,assistant`, because tool output is noise).
2. **Scroll** (`session_id` + `around_message_id` + `window`): a slice around an anchor; forward and backward by passing the edge message id back.
3. **Read** (`session_id` only): whole session or head/tail for large ones.
4. **Browse** (no args): recent sessions with titles and previews.
The system prompt tells the agent to use it when the user refers to past conversation instead of asking them to repeat.

**Lasp today:** none. **Port blocker (verified):** `mattn/go-sqlite3` v1.14.40 compiles FTS5 only under the build tag `sqlite_fts5` or `fts5` (`sqlite3_opt_fts5.go`), the Taskfile build tags are `osusergo,sqlite_omit_load_extension`, and nothing in `pkg/` uses FTS5 yet. Add `sqlite_fts5` to the `go build -tags` line in `Taskfile.yml` (`build:server:internal`) before any search work. **Difficulty: M** (needs Phase 3 persistence first).

## 5. Skills

**Format:** a directory under `~/.hermes/skills/` with a `SKILL.md` that has YAML frontmatter (`name`, `description`, `version`, optional `platforms`, tags, category, conditional-activation fields) and body sections: when to use, procedure, pitfalls, verification. Compatible with the open agentskills.io standard. Optional `references/` files per skill.

**Progressive disclosure (token control):**
- Level 0: a compact index (name, description, category) lives in the system prompt, about 3,000 tokens for the bundled set.
- Level 1: `skill_view(name)` loads the full body only when the task matches.
- Level 2: `skill_view(name, path)` loads one reference file.
The prompt tells the model to scan the index before replying and load a skill that clearly matches.

**Conditional activation:** a skill can hide itself unless certain tools or toolsets are present (`requires_*`), or only appear when something is missing (`fallback_for_*`). Platform restriction hides a skill on other operating systems.

**Authoring:** the agent creates and edits skills with a `skill_manage` tool (create, edit, patch, write_file, delete). `/learn` turns a source (a folder, URL, pasted notes, or the current conversation) into a skill; very large sources become a lean `SKILL.md` plus one distilled file per topic under `references/`. `skills.write_approval: true` stages every skill write; `/skills pending`, `/skills diff <id>`, `/skills approve <id>` review them.

**Changes mid-session:** the system prompt keeps its old index (cache stability); a one-shot note on the next user message names added or removed skills. The prompt index refreshes at the next compaction.

**Compression interaction:** when a loaded skill's text is pruned during compaction, the result carries a marker saying it was lost, and the summary lists "pruned skills" so the agent knows to reload them.

**Maintenance ("curator"):** a background pass over agent-created skills tracks views, uses and patches, marks skills `stale` after 14 days unused, `archived` after 30, and periodically asks a model to propose merges. Pinned skills and skills referenced by scheduled jobs are exempt; never-used skills get a grace period.

**Lasp today:** none, though this repo already uses skill-style guides in `.kilocode/skills`.

**Port:** the file format (reuse it as is), the three-level loading with the index in the prompt, the `skill_view` tool, and a `skill_manage` tool gated by approval. Defer `/learn` and the curator. **Difficulty: M.**

## 6. Context compression

**Triggers:** the agent-side compressor fires when prompt tokens reach 50% of the model's context window (`compression.threshold` 0.50, code-checked at `config_defaults.py:588`). A separate gateway "hygiene" pass at 85% protects sessions that grew between turns. Token counts come from the provider's last usage figure plus a rough estimate for what was added since; a pure character estimate is a last resort, and the first request after a model switch waits for real usage.

**Algorithm (four phases):**
1. **Prune old tool results** with no model call: results over 200 characters outside the protected tail become a short "cleared" stub. A tool round the model has not yet answered is kept verbatim.
2. **Choose boundaries:** keep the first 3 messages (system plus first exchange), a protected tail, and summarize the middle. The tail is token-budgeted (walk backward until the budget runs out) with a minimum of `protect_last_n` = 20 messages, capped at 20% of the window. Boundaries are aligned so a tool call and its result are never split.
3. **Summarize the middle** with one auxiliary model call into a fixed template: Goal, Constraints & Preferences, Progress (Done / In Progress / Blocked), Key Decisions, Relevant Files, Next Steps, Critical Context. Budget: 20% of the content being compressed, minimum 2,000 and maximum min(5% of window, 12,000) tokens.
4. **Assemble** head + summary + tail, then repair any orphaned tool call/result pairs (drop results with no call; add a stub result for a call whose result was removed).

**Iterative:** on later compactions the previous summary is passed in with instructions to update it, so information survives repeated compactions.

**"Lean" tail mode (default):** keep a small tail (2.5% of the window, 10K floor, 25K cap) and carry continuity in the summary instead: a detailed log, a regex-extracted index of identifiers (PR numbers, hashes, paths, error strings), every real user message quoted verbatim, and a pointer telling the agent to use `session_search` to recover anything that was summarized away. Their evals report about 49K tokens retained versus 162K with higher recall when paired with that recovery pointer.

**Failure handling:** a failed or stalled summary starts a cooldown (60 s, then 300 s, then 900 s). The deterministic fallback summary (a static list of anchors) is used after repeated stalls or sustained provider overload, so a broken summarizer cannot loop forever. If the summary model has a smaller context window than the main model, the summary can fail and the middle is dropped without a summary, so the doc warns to size it correctly. By default compaction happens in place on the same session id: old rows are archived (`active=0`) and stay searchable.

**Lasp today:** none.

**Port:** the four phases, the fixed summary template, tool-pair safety, iterative update, and the cooldown plus deterministic fallback. Start with the classic tail mode (simpler) and add lean mode once session search exists. **Difficulty: M–L.**

## 7. Tool safety and approval

- **Dangerous-command approval** with modes `smart` (default: an auxiliary model rates risk; low risk auto-approved, clearly bad auto-denied, uncertain asks the user), `manual` (always ask) and `off`. Timeout 300 s and **timeout means deny**. Headless contexts (cron, single-query, webhooks) default to deny.
- **Patterns** include recursive deletes, world-writable chmod, mkfs/dd to devices, SQL `DROP` and `DELETE` without `WHERE`, writes to `/etc`, `~/.ssh` or the env file, piping a download to a shell, `bash -c` style execution, killing the agent itself, and container lifecycle commands.
- **Hardline blocklist** that nothing overrides (not YOLO, not "allow always"): `rm -rf /`, fork bombs, writing a mounted root device. User-defined `approvals.deny` glob rules are checked before YOLO and `mode: off`, matched case-insensitively against the command and its sub-commands, with quote and wrapper handling (`sudo`, `env`, `nohup`, `timeout` and others). Hermes itself says this is a policy layer, not a sandbox.
- **File writes:** protected paths are always blocked, and an optional safe-root restricts writes.
- **Container backends** skip the command check because the container is the boundary.
- Environment variables are passed to sandboxes only if a skill declares them or the config allows them.

**Lasp today:** `toolapproval.go` and per-tool approval exist; no pattern engine, modes, or deny rules.

**Port:** manual/off modes first, a hardline list, user deny globs, fail-closed timeout. Skip the smart (model-judged) mode initially. **Difficulty: S–M.**

## 8. Subagents (`delegate_task`)

The agent can spawn child agents with isolated context, their own iteration budget (default cap 50), skipping the persona and project files, and async completion bookkeeping in the state DB. Not in the original plan; consider it for Phase 8 only if you want parallel research.

## 9. What to leave out

Gateway and platform adapters (Telegram, Discord and so on), the three provider API modes and their adapters, credential pooling, billing views, Codex-specific compaction, Bedrock handling, the plugin catalog, voice, cron, kanban and the web dashboard. None are needed for a Lasp-native assistant.

## 10. Suggested port order (revises the plan)

1. **Phase 3 persistence + FTS5 build tag** (blocks everything else).
2. **Phase 4 layered prompt** (cheap, immediate value; fix the stale "cannot run commands" text).
3. **Phase 5 memory** (two files, hard limits, frozen snapshot, `memory` tool).
4. **Phase 5b `session_search`** (needs persistence).
5. **Phase 6 skills** (index in prompt, `skill_view`, approval-gated `skill_manage`).
6. **Phase 7 compression** (summary template, tail, tool-pair repair; lean mode after search).
7. **Phase 8 loop controls** (iteration cap, fallback, concurrency, interruption) and approval modes/deny rules.
8. Later: background review, curator, `/learn`, subagents.

## 11. Open questions for a code-level pass

- Real default for the iteration budget (doc says 500; `config_defaults.py` has `None`).
- Exact text and size of the memory-tool guidance block in the system prompt, and the review prompt used by the background pass. Read `agent/prompt_builder.py` and `agent/background_review.py`.
- How the `smart` approval model call is prompted (`tools/approval_smart.py`).
- What `micro-compaction` does (a separate developer doc, not yet read) and whether it is worth porting.
- Whether the doc's token numbers (for example the 3,000-token skills index) hold with your own skills.
