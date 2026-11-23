# Authorized raw CDP and owned session release

Inventory before edits:
- `src/cdp.ts` opens browser panels through ambient `CdpConnection.connect`, without the explicit native opener used by confined Eval/browser-panel runtimes. Workspace panels alone use the registered testkit driver. This is the actual wrong boundary, not missing global browser APIs.
- `src/panels.ts` uses this helper for viewport changes, layout audit and evaluation. `src/profile.ts` uses it for panel CPU profiles and heap snapshots. `src/index.ts` exports driver helpers and `src/panels.ts` imports driver registration. The package already requires `vibestudio.testkit-driver.v1`; no new capability is needed.
- `src/driver.ts` owns the proxy protocol and event polling. Its close sets closed before its final drain (so the drain does nothing), returns void, and detaches the native close promise. Subscriptions are also detached, so a send can race event subscription.
- `workers/testkit-driver/index.ts` obtains a target-bound endpoint through native `main.panelCdp.getCdpEndpoint`; Host panelCdp authority preparation checks the actual target and the bridge redeems a requester/target-bound grant. Existing target/authority preparation remains unchanged. Driver sessions need authenticated caller ownership as well as unguessable IDs.
- `src/workerd-profile.ts` already supplies endpoint.openSocket to the explicit native connection; it is a separate correct transport and is not changed.
- Raw session close consumers are cdp.withCdpSession and the three profile helpers. TestContext resource acquisition/owned teardown is implemented in a disjoint strand in run.ts/panels.ts; raw CDP uses that same acquire API.

Route both panel kinds through the authorized driver and remove ambient fallback. Await idempotent close in every helper; preserve both operation and cleanup failures. Resolve subscriptions before sending commands and drain resulting events before returning command completion. Native cdpClose atomically retires the owned session and returns final buffered events, avoiding a stalled drain keeping control authority live. All final native cleanup attempts run even when one fails. Caller ownership comes from authenticated runtime identity, not model arguments. No public stable task-reference API exists on DurableObjectBase, so per-request IDs (which change between commands) must not be misused as session ownership.

Focused tests cover the real confined VM with no fetch/WebSocket, authorized driver routing for both kinds, denied targets/foreign sessions, event-subscription and late-event ordering, idempotent awaited close, primary plus cleanup failure and actual owned acquisition/timeout teardown after the shared tracker merges. No paid inference or full campaign is needed.

Validation: `cdp-driver.test.ts` bundles production SDK and receiver in isolated
VMs without ambient fetch/WebSocket. The only client endowment is the declared
service protocol. Native Chromium/socket I/O is an explicit test double behind
the real receiver and native authorization call; these are not live-Chrome
claims. Cases cover browser/workspace routing, denied foreign target/caller,
event delivery, overflow rejection, joined close, cleanup errors, heap bytes,
failed profiler setup and acquisition tracking. Profile helper close calls are
awaited; startProfile initialization failure also releases its owned session.
The bounded native event ring remains bounded and a missing sequence now fails
explicitly instead of returning a truncated heap artifact.
