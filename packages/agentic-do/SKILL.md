---
name: agentic-do
description: Develop @workspace/agentic-do agent runtime behavior, including model and provider defaults, live session tuning, tool-failure diagnostics, structured channel observations, and subagent supervision.
---

# Agentic DO

For a change that spans the chat panel, default agent, channel, or shared event
contract, read [agentic development](../../skills/agentic-development/SKILL.md).

Before editing, read the local reference that matches the task:

- [Agent tuning](references/agent-tuning.md): default model/provider changes,
  model credential setup, thinking effort, approval, and response policy.
- [Subagents](references/subagents.md): `spawn_subagent`, child task channels,
  retained collaborator context, follow-up turns, child state inspection,
  semantic integration, and cancellation.
- [Failures and diagnostics](references/failures-and-diagnostics.md): the
  structured tool-failure envelope, primary/cleanup ordering, bounded
  invocation diagnostic packets, and paged explanations of failures outside the
  current lineage.

Core runtime mechanics live in this package. Projection and rendering details
can live in sibling packages such as `../agentic-core` or `../agentic-protocol`.
The standard chat worker is `../../workers/agent-worker`.

## Automation turns

`src/native-automation-runs.ts` implements automation runs:

- Prompt automations submit native conversation input with
  `whenBusy: "followUp"`. If the agent is busy, the input keeps its place in
  the native queue and runs with the normal tool permissions.
- Model-free evals run the selected protected eval tool as a native direct
  task.
- The original run ID ties admission, automation metadata, the actual terminal
  outcome, and the acknowledgement to MissionsDO.
- Native tasks keep failed delivery and cleanup state until the task that owns
  them settles it.

Keep this logic in that file. Do not add another execution queue, and do not
infer completion from a transient channel message.

## Structured channel observations

A channel subscription can opt an agent into specific non-chat payload kinds:

```ts
{
  name: "Incident agent",
  observations: {
    payloadKinds: ["application.incident.v1"]
  }
}
```

- Kinds match exactly.
- Self-authored events and infrastructure payload kinds are excluded.
- Only `wakePolicy: "every-envelope"` wakes the agent for observations; other
  wake policies suppress them.
- The envelope ID gives the prompt a deterministic identity.
- Observation configuration controls what reaches the model, not channel
  access.

The configuration contract is in
`../agentic-core/src/agent-subscription-config.ts`; routing, prompt shape, and
payload bounds are in `src/agent-vessel.ts`. Keep those files and their focused
tests aligned rather than copying their constants here.
