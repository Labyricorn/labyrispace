# Wave vendor connection removal

Implemented for the Labyrispace host application, based on Wave v0.14.5. This change does not modify the separate original Wave evaluation or sandbox programs launched in terminals.

## Functionality affected and remedies

| Feature | Result | Remedy or alternative |
| --- | --- | --- |
| Usage analytics, display reports, command-category counters, startup/activity events | Collection and upload disabled in code. Existing local records are retained but cannot be uploaded by the compatibility RPCs. | Keep diagnostics local. An optional user-reviewed export could support troubleshooting later. No replacement telemetry is needed. |
| Daily diagnostic ping and telemetry preference notification | Diagnostic loop removed; legacy sending entry points are inert. Changing preferences makes no vendor request. | Use local logs and the planned Local Services extension. Add an explicit diagnostic export if needed. |
| Free Wave-hosted Quick/Balanced/Deep AI modes | Removed from defaults/effective configuration and rejected by the backend. Wave endpoint environment overrides are ignored. Existing chats remain stored, but their removed model may need changing. | Configure your own provider credentials or a local model through the AI mode menu. Select a compatible model before continuing a chat. Terminal CLI agents remain independent. |
| AI-assisted app/builder generation using Wave-hosted models | The hosted default is unavailable. The builder now follows the user's non-vendor default instead of depending on telemetry. | Configure a non-vendor model with the tools/capabilities the builder needs. Actual builder generation and paid providers need separate end-to-end evaluation; they are not claimed as verified here. |
| Automatic update checks/download/install, including manual upstream check | Updater implementation and packaged upstream feed removed. Menu reports manual installation; compatibility actions explain this without connecting. | Install reviewed Labyrispace builds manually. A future updater needs our own release feed, signing, and explicit update policy. Upstream distribution workflows are inherited build infrastructure, not a configured Labyrispace release service. |
| Automatic upstream GitHub starter page and default browser homepage | Starter now opens built-in Help; browser default is about:blank. | Use local Help or deliberately open a permitted website. No automatic replacement network homepage was added. |
| Hosted help, vendor documentation/privacy/sponsor links, and older upstream onboarding links | Help is local. External handoffs to Wave services or its GitHub namespace are refused with an explanation. New onboarding no longer asks for telemetry or GitHub support; About retains local attribution. Wave upgrade announcements, GitHub-star solicitations, and the upstream Release Notes menu are removed from runtime registration/rendering. Some other inherited contextual documentation links may still show their old labels, but cannot connect. | Expand local help/documentation as features stabilize. LICENSE, NOTICE, and dependency acknowledgements remain in the project. |
| Saved vendor web widgets | Retained in layouts but display a disabled-service explanation; their initial content is replaced with about:blank. Session policy also blocks vendor requests and redirects from other pages. | Close/replace the widget or enter a non-vendor address. User profiles are not destructively migrated. |
| Imported telemetry/update settings, vendor AI modes, environment overrides | Effective configuration forces telemetry/update/cloud visibility off and filters vendor modes. Raw user settings are preserved. Legacy telemetry-enable RPC returns an explicit error. | Remove obsolete entries when editing configuration for clarity; removal is not required for enforcement. |

## Functionality retained

- Local terminal processes, shell state/output, terminal-window transfer, tabs/windows, layout persistence, local files, media previews, and system information do not require Wave services.
- SSH/remote features and user-configured AI endpoints are not intentionally removed. Local endpoint and AI configuration preservation are tested; real remote/durable sessions and real provider credentials are not exercised by this change.
- CLI agents such as Claude Code, Codex, OpenCode, and Pi keep their own independent connections. Removing host telemetry does not make those tools offline.
- Explicit searches in web widgets still use the configured search engine (Google by default); empty/about:blank pages stay local.
- Other websites and external links remain permitted. Websites can contact their own third parties. Build/install tools such as npm, Go, Git, and GitHub CLI still need their normal dependency/repository access.

## Enforcement and boundaries

- All `waveterm.dev` hosts/subdomains, including development, cloud AI, diagnostic, documentation, and download hosts, are denied.
- WaveTermDev's namespace on GitHub, its sponsor page, repository API, raw content, and archive download routes are denied. Other GitHub projects remain available.
- A Go HTTP transport rejects vendor destinations and vendor proxy addresses before dialing, including redirect targets. The backend and newly built Windows helper install it at startup. AI clients also wrap their custom proxy transports, so a provider redirect cannot bypass the policy.
- Every Electron session receives a request blocker. External-browser handoffs share the same URL policy. Known application-owned sending paths are removed or disabled independently of those blockers.
- This does not prevent arbitrary terminal programs, native extensions, proxies, or a future custom socket/transport from making connections. A full offline deployment needs separate network isolation and auditing of permitted tools/providers.
- Regular local operational logs (including AI timing/status information) still exist; disabling usage analytics does not remove useful local application logs.
- Previously transmitted events cannot be recalled. Existing databases, secrets, command history, and layouts are retained; raw test traces/profiles stay under ignored `.local/`.

## Verification

- Windows backend, shell helper, and Electron frontend builds completed. Inherited documentation-tsconfig/image-optimizer warnings remain. Full TypeScript checking still reports inherited preview-fixture errors; no new application diagnostics remain.
- Backend vendor-policy/configuration/AI/telemetry/transfer tests pass. Frontend checks pass 41 tests: 18 URL-policy fixtures, 18 layout tests, and five webview tests (including blank-page and saved-URL regression cases).
- A fresh development profile started without cloud endpoint variables, telemetry opt-out flags, or a prewritten privacy configuration. Its welcome initialized a local starter workspace and rendered local Help.
- Re-enabled legacy telemetry/update/cloud settings and supplied Wave endpoint environment variables; effective settings stayed disabled. The raw settings file stayed intact. A legacy telemetry-enable request was rejected. Local telemetry/activity tables remained at zero rows.
- A permitted local HTTP service responded successfully. Deliberate Wave requests and a local-server redirect to Wave were blocked. A real request through the application's AI backend received a streamed reply from a local OpenAI-compatible **mock** provider; a Wave provider mode was refused. This verifies local-provider plumbing, not real model inference or paid provider credentials.
- Terminal transfer preserved shell PID 1100, a test variable, working directory, previous output, and input after transfer. Restart recovered the layout and a saved vendor widget with its original address intact; it showed the disabled-service message and loaded about:blank.
- The initial live run exposed an inherited bug: about:blank became a Google search. That run is a **failed validation**, retained only as debugging evidence. URL normalization and placeholder persistence were corrected and covered by regression tests before repeating runtime validation.
- Final post-correction Chromium NetLog captured 18,743 events during startup/restart, saved-widget handling, local service/provider use, and deliberate blocked vendor/redirect probes. Only loopback TCP destinations were recorded, with zero DNS transactions. The only non-loopback URL host appearing in request records was api.waveterm.dev from the deliberately blocked probes; it had no TCP/DNS connection. A scoped process snapshot also showed zero established external connections.
- Raw traces, logs, profiles, and connection summaries are kept in ignored .local/; they are not published. The test application was closed after verification.

These are bounded Windows development-build observations, not a packet capture or proof that every possible provider, extension, packaged build, or terminal program is offline. Remote/durable sessions, real paid-provider credentials, full-screen terminal applications, and installer/update distribution still require their own checks. The repository test script retains these policy and regression checks.
