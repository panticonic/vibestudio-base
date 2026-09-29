---
name: automations
description: Launch recurring or later work immediately, then inspect and control its exact behavior, authority, runs, conversations, results, and failures.
---

# Automations

Use this skill for work that should run later, repeatedly, on a calendar, or on demand without another chat turn. Read [API.md](API.md) before authoring or debugging an automation.

`vibestudio.missions.v1` is the only schedule and run-ledger owner. Do not add a second timer, worker cron, alarm loop, queue, or history store.

For work performed by the current agent, call `launch_automation` directly. A successful call creates an active automation immediately and publishes an inspectable automation pill in the current conversation. The pill is a controller, not an approval gate. It opens the same definition and run history shown in **Automations**.

When the user asks to stop, pause, resume, run, or remove an automation, call
`control_automation` directly. Do not discover the missions service, list it
through eval, or ask for a second confirmation. “Stop”, “disable”, and “turn it
off” mean reversible `pause`; use permanent `retire` only for an explicit
remove/delete request. The native tool resolves only automations visible to the
current user and the missions service enforces ownership again at mutation.

## Choose the executor

- Use an agent `prompt` when a model should reason each run.
- Use agent `watch` for a deterministic check that should wake the model only when something changes. It returns `{protocol: "automation-signal.v1", prompt: null}` to finish quietly, or a nonempty `prompt` to continue the same run into the agent. The prompt should include the observation, the requested response, and any explicit notification instruction. Errors fail the run; they are not quiet results.
- Use agent `eval` for a small exact script that should run as the same agent and use its ordinary channel-bound EvalDO. Eval code has the ordinary module API; model-facing tools such as `notify` are not JavaScript globals. If a run must use an agent tool, use a prompt action.
- Use a lower-level `method` charter for a reusable deterministic method on another exact Durable Object image.

A prompt action is an instruction for the future agent turn, not a message payload. Preserve the user's requested action in that instruction. For example, if the user asks for a notification, the prompt must tell the future agent to notify the owner; a prompt containing only the notification's text merely asks the agent to say that text in the conversation.

An automation launched during an ongoing conversation continues with the current agent in that conversation by default. This keeps its results and notifications where the user asked for them and lets later wake-ups benefit from shared context. Omit `conversation` or use `conversation: { mode: "continue" }`; the tool binds the current channel and context itself.

A run requested while this agent is busy waits in its durable turn queue.
When no foreground work remains, use `suspend_turn` to yield to that work;
do not poll for a run waiting behind your own turn. Model-free eval results
appear directly in the conversation. User Stop also parks queued runs until
explicit input resumes the agent.

Use `conversation: { mode: "fresh" }` only when the automation is a genuinely separate topic or a long-running background task that should have its own context. For an interval of one hour or less, continue the existing conversation whenever the work benefits from shared context. If wake-ups may be more than one hour apart, shared context would still help, and the user's intent is unclear, ask whether they want the existing conversation or a fresh one before launching. The one-hour boundary is a product decision about conversational continuity and likely provider-cache reuse, not a reason to discard context the user asked to retain.

## Launch correctly

1. Resolve only user choices that materially alter the job: behavior, cadence and timezone, optional end condition, and—only for an ambiguous shared-context job with wake-ups more than one hour apart—fresh versus continuing conversation. Do not ask for a conversation-mode choice for ordinary short-cadence work in the current conversation; continue it.
2. Before scheduling, enumerate every external service operation reasonably
   predictable from the task, including service calls a future prompt action is
   expected to choose. Declare each as `{ service, method, args?, use }`, where `use` is
   `action` or `conditional`. These are launch-time acquisition plans, not
   capability names, grants, or a runtime allowlist. Do not leave a foreseeable
   gated service call for an unattended run to discover. Model-facing tools
   such as `notify` already own their internal effects; do not reverse-engineer
   them into service operations.
   Declare only external service calls made by the action. Scheduling, fresh-conversation creation, delivery of the eval result into that conversation, and the `automation-completion.v1` return are intrinsic mission behavior: do not invent `missions.finishRun`, `chat.publish`, or similar operations for them.
3. Call `launch_automation` once with the action, trigger, conversation mode, and operations. Do not wrap it in eval and do not discover the current agent’s build, class, object key, channel, or context first; the receiver seals those facts atomically.
4. Report the active automation’s name and cadence. Point to its pill for inspection or control; do not publish a second card or ask for a second launch approval.

Example:

```ts
({
  name: "Talk timer",
  summary: "Every minute, tell the owner that another minute has passed.",
  action: {
    kind: "prompt",
    text: "Notify the owner with the exact text: ⏱️ One minute has passed.",
  },
  trigger: { kind: "schedule", everyMs: 60_000 },
  conversation: { mode: "continue" },
  operations: [],
});
```

For a small model-free project-status check, return the status text from eval; the run publishes that result in its conversation. Declare the status read itself:

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
        return {
          protocol: "automation-completion.v1",
          response: "The project is clean and in sync.",
        };
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
  conversation: { mode: "fresh" },
  operations: [{ service: "vcs", method: "status", use: "action" }],
});
```

## Authority

The agent never authors capability rows. At launch, the host compiles declared
operations against receiver-owned method contracts into an immutable,
content-addressed authority plan. It derives the exact capability and resource
for each operation and starts ordinary durable acquisition for the actual
authority-bearing executor.

- A continuing automation is an ordinary wake-up of this existing agent. It
  pre-acquires for the agent task and later tools/eval use the same authority
  path as an ordinary user-driven turn. It never overlays mission authority on
  the shared conversation.
- A fresh agent or non-agentic method/eval executes for the revision subject
  `mission:<id>@<revisionDigest>`. Its executor and child eval inherit that
  mission authority through ordinary execution admission.

Channel IDs are routing facts, never authority subjects; context IDs are
conversation facts.

Pre-acquisition is the normal authoring path, but the authority plan is not a runtime allowlist, grant, tool surface, or network ceiling. If an operation was omitted or authority is absent when an admitted run reaches it, ordinary acquisition presents the exact approval, durably parks the invocation, and resumes after the decision. Structural reach still comes from the immutable code manifest and ordinary agent/eval tool exposure. Critical or otherwise non-standing authority always uses the invocation-time path. In particular, do not force automation eval into `pregranted-only`.

Do not broaden operations to avoid an approval. A denial is evidence to preserve and explain, not a reason to retry through another caller or transport.

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

Use cron for wall-clock cadence and always provide an IANA timezone:

```ts
{
  kind: "cron",
  expression: "5 5 * * THU",
  timezone: "America/New_York",
  maxRuns: 20,
}
```

The minimum cadence is one minute. `untilAt` prevents a run starting at or after the boundary. `maxRuns` counts admitted runs; overlap skips do not count. Calendar evaluation follows the declared timezone through daylight-saving transitions.

## Lifecycle and recovery

- `pause` stops new admission, preserves isolated mission grants, and never
  revokes authority from a shared continuing agent task.
- `resume` re-enables the same revision.
- `edit` creates a new immutable revision, authority plan, subject, and authority acquisition.
- `retire` permanently prevents new runs and retires revision authority after live executions close.
- A failure is recorded on the run; it does not silently pause the automation.
- One run remains active at a time. If another tick becomes due first, it is
  recorded as skipped and one persistent inbox item says that the automation is
  delayed; repeated overlaps for that run do not create an alert storm.
- `already_handled`, `not_addressed`, and `no_foreground_work` finish the
  current turn. Only concrete outstanding background work keeps it suspended.
- A turn that reaches a final response after one or more child effects fail is
  recorded as `completed-with-errors`, never `succeeded`. The run retains each
  failed invocation's tool name, code, outcome, and message. The mission owner
  projects that attention through the ordinary durable GAD inbox with a
  retryable outbox; an alert transport failure cannot erase or strand the run.

Runs use durable phases. On wake or restart, the mission owner resumes nonterminal phases before admitting newly due work. External effects use stable idempotency keys derived from the run and phase.

Every outbound RPC started by a run is a causal child of that execution. The
runtime keeps the parent admission alive until those children settle, even if
userland forgot to await a child promise. Code that intends to continue after
the invocation must persist a queue/outbox item and resume it under a new
admitted execution; `waitUntil` or a floating promise is not an authority or
durability boundary.

A prompt can complete its recurring goal with `complete_automation({ response })`. Eval or method code returns the equivalent protocol:

```ts
return {
  protocol: "automation-completion.v1",
  response: "The monitored rollout is healthy.",
};
```

When debugging, open the automation pill or **Automations**. Every open reads
the canonical mission ledger rather than the launch-time snapshot and shows
recent runs, failed effects, authority-plan reference, declared pre-acquisition
operations, pending/granted/denied authority, current phase, and executor. Do
not infer authority from a channel ID or a successful prior run.

For a watch that should notify its owner, the returned nonempty prompt must
instruct the future agent to call `notify` with `to: "owner"` and
`alert: "inbox"`. Returning notification text or producing a final chat reply
does not deliver an inbox notification. Preserve this requested effect when
writing the check, just as for a prompt automation.
