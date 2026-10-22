# Test plan: keep the backend auth key away from web content

Status (2026-10-22): the fix is implemented and verified. Layer 1 building blocks are wired into the app, the three previously-skipped handler tests are un-skipped and passing, and the source-check `it.fails` marker is flipped to a passing assertion. Layer 2 confirmed on an isolated profile under `.local/`: the app boots clean (no 401/403), app windows use the `persist:labyrispace-app` session, a live `<webview>` resolves to the separate `persist:labyrispace-web` partition (`isSeparate: true`), and main-process service calls return 200. This remains a defensive plan: every test checks that a component behaves correctly for synthetic inputs. None of them is an attack page, port probe or exploit script, and none should become one.

## Background

Electron generates a per-launch auth key and attaches it as an `X-AuthKey` header to requests for the backend's loopback address (`emain/authkey.ts`, applied to the default session and tab sessions in `emain/emain.ts` and `emain/emain-tabview.ts`). The backend checks the key on its HTTP and WebSocket routes (`pkg/web/web.go`, `pkg/web/ws.go`). Web widgets use the Electron default session unless `web:partition` is set (`frontend/app/view/webview/webview.tsx`). The backend's WebSocket upgrader accepts any `Origin` (`pkg/web/ws.go`).

Open question: can content loaded in a web widget cause requests to the backend that carry the key? Answer (2026-10-22): No, after the fix. App windows and web widgets now use different Electron session partitions (`persist:labyrispace-app` vs `persist:labyrispace-web`), and the auth key is injected only for the app session's requests, so a web widget's session never carries the key. The backend additionally rejects foreign `Origin` values and requires `application/json` on `/wave/service`. Verified by code + Layer 1/3 review and an isolated-profile Layer 2 smoke (see devlog 2026-10-22). The plan below documents what must be true and how each property is checked cheaply and repeatably.

## Invariants to assert

| Id | Invariant |
|---|---|
| I1 | Requests that originate from a web widget (guest) session never get `X-AuthKey` added. |
| I2 | A web widget with no saved partition never resolves to the default session. An explicit `web:partition` is preserved. |
| I3 | The backend rejects HTTP requests whose `Origin` header is present and not on the app's allowlist. Requests with no `Origin` (the shell helper, Electron main) still work with a valid key. |
| I4 | The WebSocket upgrade applies the same origin rule. |
| I5 | The service-call route accepts only `application/json` bodies. |
| I6 | The app's own windows keep working: local file preview, AI chat post, terminal and widget creation, local Help. |
| I7 | Existing layouts keep their widgets and saved URLs; only guest session storage (cookies, logins) is reset once. |

## Changes that make these testable

1. Move the "should this request get the key" decision into a pure function, for example `shouldInjectAuthKey(details, appWebContentsIds)`, used by the existing `onBeforeSendHeaders` hook.
2. Move partition choice into a pure function, for example `resolveWebPartition({ override, metaPartition, blockId })`, returning a non-empty dedicated name when neither is set.
3. Put the origin allowlist in one Go function used by both the HTTP wrapper and `WebSocketUpgrader.CheckOrigin`.

These are small refactors that also make the code easier to read.

## Test layers

**Layer 1: unit tests (fast, no network).**
- Frontend/Electron (`vitest`):
  - Table test for `resolveWebPartition`: no override, empty string, explicit partition, tsunami override, two blocks get different names. Covers I2, I7.
  - Table test for `shouldInjectAuthKey` with synthetic `details` objects: app window contents id (true), guest contents id (false), unknown id (false), non-backend URL (false). Covers I1.
  - A static check that no module other than the authorized setup registers key injection on `session.defaultSession` outside the allowed list. Keeps the property from regressing.
- Go (`go test`):
  - Table test of the origin allowlist function: app origins accepted, empty accepted, `null`, `http://example.com`, a different loopback port, and a similarly named host rejected. Covers I3 and I4.
  - `httptest` handler tests through the real `WebFnWrap`: foreign `Origin` returns 403 even with a valid key; no `Origin` plus a valid key succeeds; missing or wrong key returns 401. Covers I3.
  - `httptest` test of the service route: `text/plain` body is refused, `application/json` is accepted. Covers I5.
  - Upgrader test: call `WebSocketUpgrader.CheckOrigin` directly with synthetic requests. Covers I4.

**Layer 2: integration smoke on the development build (isolated profile).**
Reuse the existing CDP harness in `.local/` to confirm nothing broke:
- The app starts, a terminal accepts input, and a local image or video preview loads through the backend file route (needs the injected key in app sessions). Covers I6.
- The AI panel's message post path still reaches the backend with a local mock provider. Covers I6.
- The local Help view renders. Covers I6.
- A web widget's `<webview>` element reports a partition attribute that is not empty. Covers I2 in the running app.
- A layout created before the change opens with its widgets present and saved URLs intact. Covers I7.

**Layer 3: review checklist (manual, no tooling).**
- Search the tree for every call that adds the key header or reads it through the preload; each must belong to an app-owned window.
- Confirm the preload exposed to web content does not expose the key getter.
- Confirm the backend log shows rejected foreign-origin requests as a single line without echoing header values.

## Red/green sequence

1. Land the three small refactors with behavior unchanged and the new tests marked expected-failing where they describe the fix.
2. Confirm Layer 1 fails exactly where the fix is missing (partition default, origin check, content-type check).
3. Implement the fix: dedicated default partition, injection limited to app sessions, backend origin and content-type checks.
4. Confirm Layer 1 passes, then run Layer 2 and the checklist.
5. Add the one-time re-login note to the release notes and the Help text.

## Explicitly out of scope

- Any test page, script or tool that discovers the backend port, scans ports, or sends requests as web content would.
- Any packet-level or process-memory probing of the running app.
- Testing against machines or accounts other than an isolated development profile.

## Who runs what

The owner (or a separate model the owner chooses) runs Layer 1 and Layer 2 after the fix lands. Layer 1 needs no running app. Layer 2 uses an isolated profile under `.local/` and never the real profile.

## Done when

- All Layer 1 tests pass in the repository test script.
- Layer 2 smoke checks pass on a fresh and a legacy profile.
- The checklist is signed off in `devlog.md`.
- `phase1-inventory.md` section 5.1 is updated to say the property is enforced and tested, or to record any gap found.

## Decisions recorded while writing the Layer 1 tests

- Web widgets without a saved partition use one shared named partition, `persist:labyrispace-web`, so logins are shared between widgets and reset only once. A widget with its own `web:partition` keeps it.
- Open question for Layer 2 before wiring the origin check: confirm which `Origin` value the packaged app's own windows send. Pages loaded from files can report `null`, which web content can also produce, so `null` is rejected by default in `IsAllowedOrigin`. If the app's windows really send `null`, the partition and key-injection changes carry the protection and the origin check stays a secondary layer.
- New files: `emain/authkey-policy.ts`, `frontend/util/webpartition.ts`, `pkg/web/origin.go`, each with tests. The test script now runs `emain` and `pkg/web`.
