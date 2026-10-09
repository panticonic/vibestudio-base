---
name: automations
description: Launch recurring or later work immediately, then inspect and control its exact behavior, authority, runs, conversations, results, and failures.
---

# Automations

Use this skill for work that should run later, repeatedly, on a calendar, or on
demand without another chat turn. Read [API.md](API.md) before authoring or
debugging an automation.

`vibestudio.missions.v1` owns all schedules and the run ledger. Do not add
another timer, worker cron, alarm loop, queue, or history store.

For work performed by the current agent, call `launch_automation` directly. A
successful call creates an active automation immediately and publishes an
automation pill in the current conversation.
The pill is a controller, not an approval gate.
It opens the same definition and run history shown in **Automations**.

When the user asks to stop, pause, resume, run, or remove an automation, call
`control_automation` directly. Do not discover the missions service, list it
through eval, or ask for a second confirmation. “Stop”, “disable”, and “turn it
off” mean reversible `pause`; use permanent `retire` only for an explicit
remove/delete request. The tool resolves only automations visible to the
current user, and the missions service checks ownership again on mutation.

## Choose the executor

- Agent `notify`: deliver fixed text to the owner's inbox (and phone) on each
  run, with no model turn. Use it for reminders and any message whose text is
  known at launch. It runs in the current conversation, which the notification
  links back to. The run fails if the inbox entry cannot be written; the phone
  push is best effort.
- Agent `prompt`: a model should reason on each run.
- Agent `watch`: a deterministic check that wakes the model only when something
  changes. It returns `{protocol: "automation-signal.v1", prompt: null}` to
  finish quietly, or a nonempty `prompt` to continue the same run in the agent.
  The prompt should include the observation, the requested response, and any
  notification instruction. Errors fail the run; they are not quiet results.
- Agent `eval`: a small script that runs as the same agent in its channel-bound
  EvalDO. Eval code has the normal module API. Model-facing tools such as
  `notify` are not JavaScript globals; if a run needs an agent tool, use a
  prompt action.
- Lower-level `method` charter: a reusable deterministic method on another
  Durable Object image.

A prompt action is an instruction for the future agent turn, not a message payload. Write the user's requested action into that instruction. When the
agent's work should end in a notification, say so in the prompt ("…then notify
the owner with the result"); a final chat reply does not reach the inbox.
a prompt containing only the notification's text merely asks the agent to say that text;
use a `notify` action when the exact message is already known.

An automation launched during an ongoing conversation
continues with the current agent in that conversation by default.
Results and notifications then arrive where the user asked for them, and later wake-ups keep the shared
context. Omit `conversation` or pass `conversation: { mode: "continue" }`; the
tool binds the current channel and context itself.

A run requested while this agent is busy waits in its turn queue. When no
foreground work remains, call `suspend_turn` to let it run; do not poll for a
run queued behind your own turn. Model-free eval results appear directly in the
conversation. A user Stop also parks queued runs until new input resumes the
agent.

Use `conversation: { mode: "fresh" }` only for a separate topic or a
long-running background task that should have its own context. For an interval
of one hour or less, continue the existing conversation when the work benefits
from shared context. If wake-ups may be more than one hour apart, shared context
would still help, and the user's intent is unclear,
ask whether they want the existing conversation or a fresh one before
launching. The one-hour threshold reflects conversational continuity and likely provider-cache reuse;
it is not a reason to drop context the user asked to keep.

## Launch

1. Resolve only the user choices that change the job: behavior, cadence and
   timezone, an optional end condition, and — only for a shared-context job
   with wake-ups more than one hour apart — fresh versus continuing
   conversation. For short-cadence work in the current conversation, continue
   it without asking.
2. Before scheduling, list every external service operation you can predict
   from the task, including service calls a future prompt action is expected
   to make. Declare each as `{ service, method, args?, use }`, where `use` is
   `action` or `conditional`. These are launch-time acquisition plans, not
   capability names, grants, or a runtime allowlist. Do not leave a
   foreseeable gated call for an unattended run to discover.
   - Declare only external service calls made by the action. Model-facing tools
     such as `notify` handle their own internal effects; do not translate them
     into service operations. Scheduling, fresh-conversation creation,
     delivering the eval result to the conversation, and the
     `automation-completion.v1` return are built into the mission; do not
     invent `missions.finishRun`, `chat.publish`, or similar operations.
   - Supply the receiver's argument tuple as you would pass it through the
     runtime client. Leave out a context-bound method's `contextId`: the host
     binds it to this agent's context, so a current-project `vcs.status()`
     read is `{ service: "vcs", method: "status", use: "action" }`. These
     arguments are separate from the executor identity the launch tool seals.
3. Call `launch_automation` once with the action, trigger, conversation mode,
   and operations. Do not call it through eval, and do not look up the current
   agent's build, class, object key, or channel first; the tool seals those
   itself.
4. Report the automation's name and cadence and point to its pill for
   inspection or control. Do not publish a second card or ask for a second
   launch approval.

Example:

```ts
({
  name: "Talk timer",
  summary: "Every minute, tell the owner that another minute has passed.",
  action: { kind: "notify", text: "⏱️ One minute has passed." },
  trigger: { kind: "schedule", everyMs: 60_000 },
  conversation: { mode: "continue" },
  operations: [],
});
```

For a small model-free project-status check in this conversation, have the
scheduled eval return the status text; the run publishes it:

```ts
({
  name: "Project pulse",
  summary: "Report project status every Thursday morning.",
  action: {
    kind: "eval",
    code: `
      import { vcs } from "@workspace/runtime";
      const status = await vcs.status();
      if (status.clean && status.mainRelation === "at") {
        return "The project is clean and in sync.";
      }
      return "Project pulse: " + status.mainRelation;
    `,
    syntax: "typescript",
  },
  trigger: {
    kind: "cron",
    expression: "5 5 * * THU",
    timezone: "America/New_York",
  },
  conversation: { mode: "continue" },
  operations: [{ service: "vcs", method: "status", use: "action" }],
});
```

## Authority

The agent never authors capability rows. At launch, the host compiles the
declared operations against each receiver's method contracts into an
immutable, content-addressed authority plan. It derives the capability and
resource for each operation and starts durable acquisition for the executor
that will hold the authority.

- A continuing automation is an ordinary wake-up of this existing agent.
  Acquisition is done in advance for the agent task, and later tool and eval
  calls go through the same authority path as a user-driven turn. Mission
  authority is never layered onto the shared conversation.
- A fresh agent, or a method/eval charter without an agent, runs as the
  revision subject `mission:<id>@<revisionDigest>`. Its executor and child
  evals inherit that mission authority through execution admission.

Channel IDs are routing facts, never authority subjects; context IDs identify
conversations.

Pre-acquisition is the normal path, but the authority plan is not a runtime
allowlist, grant, tool surface, or network limit. If an operation was omitted,
or authority is missing when a run reaches it, ordinary acquisition shows the
approval, parks the invocation durably, and resumes after the decision. What
code can reach is still set by the immutable code manifest and the normal
agent/eval tool exposure. Critical or other non-standing authority is always
requested at invocation time. In particular,
do not force automation eval into `pregranted-only`.

Do not broaden operations to avoid an approval. Keep and explain a denial; do
not retry through another caller or transport.

## Scheduling

Use `{ kind: "manual" }` for run-on-demand work.

Use an interval for elapsed cadence:

```ts
{
  kind: "schedule",
  everyMs: 3_600_000,
  anchorAt: Date.UTC(2026, 7, 12, 6, 0), // optional alignment
  jitterMs: 300_000,                    // optional
  untilAt: Date.UTC(2026, 8, 1),        // optional exclusive boundary
  maxRuns: 100,                         // optional admitted runs
}
```

Use cron for wall-clock cadence, and always give an IANA timezone:

```ts
{
  kind: "cron",
  expression: "5 5 * * THU",
  timezone: "America/New_York",
  maxRuns: 20,
}
```

- The minimum cadence is one minute.
- `untilAt` is an absolute UTC instant in Unix epoch milliseconds. No run
  starts at or after it. `Date.UTC(...)` returns this value; its month argument
  is zero-based. Convert a local calendar deadline to its UTC instant first.
- Cron's `timezone` governs recurrence across daylight-saving transitions. It
  does not make `untilAt` local time.
- `maxRuns` counts admitted runs; runs skipped for overlap do not count.

## Lifecycle and recovery

- `pause` stops new runs, keeps isolated mission grants, and never revokes
  authority from a shared continuing agent task.
- `resume` re-enables the same revision.
- `edit` creates a new immutable revision, authority plan, subject, and
  authority acquisition.
- `retire` permanently stops new runs and retires the revision's authority once
  live executions close.
- A failure is recorded on the run; it does not pause the automation.
- Only one run is active at a time. A tick that comes due meanwhile is recorded
  as skipped, and a single persistent inbox item says the automation is
  delayed; repeated overlaps for that run do not produce more alerts.
- `already_handled`, `not_addressed`, and `no_foreground_work` finish the
  current turn. Only concrete outstanding background work keeps it suspended.
- A turn that reaches a final response after one or more child effects failed
  is recorded as `completed-with-errors`, never `succeeded`. The run keeps each
  failed invocation's tool name, code, outcome, and message. The mission owner
  raises this in the GAD inbox through a retryable outbox, so a failed alert
  cannot lose or strand the run.

Runs move through durable phases. On wake or restart, the mission owner resumes
unfinished phases before admitting newly due work. External effects use stable
idempotency keys derived from the run and phase.

Every outbound RPC a run starts is a causal child of that execution. The
runtime keeps the parent admission alive until those children settle, even if
userland code did not await a child promise. Code that should continue after
the invocation must persist a queue/outbox item and resume it under a new
admitted execution; `waitUntil` or a floating promise does not extend
authority or survive restarts.

A prompt can complete its recurring goal with
`complete_automation({ response })`. Eval or method code returns the
equivalent:

```ts
return {
  protocol: "automation-completion.v1",
  response: "The monitored rollout is healthy.",
};
```

When debugging, open the automation pill or **Automations**. Each open reads
the current mission ledger, not the launch-time snapshot, and shows recent
runs, failed effects, the authority-plan reference, declared pre-acquisition
operations, pending/granted/denied authority, current phase, and executor. Do
not infer authority from a channel ID or from an earlier successful run.

For a watch that should notify its owner, the returned prompt must ask the
agent to notify the owner; returning text alone does not reach the inbox.
