---
name: gad-context
description: Inspect canonical trajectory/channel logs, agent turns, invocations, publications, rosters, health, and storage diagnostics.
---

# GAD context

Use the typed `gad` namespace from `@workspace/runtime`. Read
[DIAGNOSTICS.md](DIAGNOSTICS.md) before investigating a live incident, and use
live docs for current method schemas and result shapes.

## Model

- An agent's private trajectory and the channel history it transmits are
  separate hash-chained logs.
- Agent context is projected into typed message, block, invocation, approval,
  turn, usage, and checkpoint records.
- A channel row that publishes a trajectory event carries its origin log,
  origin head, and origin envelope coordinates. Rows that originate from a
  user or the channel have no trajectory origin.
- Managed source history belongs to semantic VCS, not GAD. For files,
  changes, work units, decisions, events, history, or blame, read [Vibestudio
  VCS](../vibestudio-vcs/SKILL.md).

Don't infer joins from payload text or timestamps, reconstruct file history
from log storage, or query undocumented tables because an inspector left a
field out.

## Start with bounded inspectors

| Question                                | Inspector                     |
| --------------------------------------- | ----------------------------- |
| Channel and agent health                | `inspectAgentHealth`          |
| Open turns or message state             | `inspectTurnState`            |
| One invocation and its terminal events  | `inspectInvocationState`      |
| Compact channel history                 | `inspectChannelEnvelopes`     |
| One hydrated channel page               | `readChannelEnvelopes`        |
| Trajectory-to-channel publication joins | `inspectPublicationIntegrity` |
| Current roster                          | `inspectChannelRoster`        |
| Oversized or suspicious storage rows    | `inspectStorageDiagnostics`   |
| An agent's live debug state or outbox   | `inspectAgent`                |

Use `getTrajectoryForEnvelope` or `listPublishedEnvelopesForTrajectory` only
after a bounded inspector has identified the specific artifact. Avoid broad
hydrated reads in agent turns.

Channel reads return `{ items, pageInfo }` with tail, before, and after
windows. Pass `pageInfo.previous` or `pageInfo.next` as the next `window`, or
let `gad.collectChannelEnvelopePages` follow them; don't request oversized
pages.

```ts
const health = await gad.inspectAgentHealth({ channelId: chat.channelId });
return {
  channelId: health.channelId,
  branchId: health.branchId,
  summary: health.summary,
  turns: health.turnState.rows,
  invocations: health.invocationState.rows,
};
```

`summary.durableIntegrityOk` and `summary.activity` are separate answers:
integrity problems versus other work still open. When you inspect
`chat.channelId`, your own eval invocation and its turn are reported as
`health.caller` and excluded from activity, so take one snapshot and report
it; don't poll.

For another visible chat panel, resolve its panel handle, read its state
args, and use the stored channel ID. `chat.channelId` always means the channel
you are currently responding in.

## Going deeper

Inspector summaries, rows, byte counts, and stored-value digests are normally
enough. Fetch or hydrate a single value only when you need its content. Large
values are stored by reference; never return them whole from eval.

Use bounded schema or SQL inspection only after a typed inspector has pointed
to a specific storage defect, and confirm the live schema first. Keep private
trajectory rows, transmitted channel rows, and origin coordinates distinct.

For code provenance, follow the recorded causal edges from a typed trajectory
invocation into semantic VCS. If a fix seems to have no effect, check the
context working state, the build, and the running artifact before changing
code again.

Prefer evidence that an invariant failed over projection code that hides
corrupt logs. A failed assistant message is terminal. Unexpected open turns,
missing joins, empty rosters, or oversized inline values remain open findings
until the typed inspectors explain them.
