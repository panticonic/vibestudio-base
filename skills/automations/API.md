# Automations API

Code reaches the `vibestudio.missions.v1` controller through the `missions`
client from `@workspace/runtime`; it resolves the service and compiles
authority plans for you.

For work done by the current agent, prefer the `launch_automation` tool. It
seals the installed execution image and conversation binding, so guest code
does not have to discover its own identity. For pause/resume/run/remove
requests in conversation, prefer `control_automation`. It resolves an
automation the owner can see, so guest code does not have to discover the
service.

## Native control

```ts
type AgentAutomationControl = {
  action: "pause" | "resume" | "run_now" | "retire";
  missionId?: string;
  name?: string;
};
```

Omit the target only when exactly one eligible automation is active in the
current conversation. Otherwise pass its exact name or the `missionId` returned
by launch. Use `pause` when the user says “stop”; it is reversible. `retire` is
permanent and only for explicit deletion. A user's request to control their own
automation is executed directly by the tool and is
not routed through eval or a redundant approval card. MissionsDO still checks
ownership and user attribution.

## Agent launch input

```ts
type AgentAutomationLaunch = {
  name: string;
  summary: string;
  action:
    | { kind: "prompt"; text: string }
    | { kind: "tool"; tool: string; args: Record<string, unknown> }
    | {
        kind: "eval" | "watch";
        code: string;
        syntax?: "javascript" | "typescript" | "jsx" | "tsx";
        timeoutMs?: number;
        reset?: boolean;
      }
    | {
        kind: "notify";
        text: string;
        title?: string; // defaults to the automation name
        alert?: "inbox" | "interrupt"; // default "inbox"
      };
  trigger: MissionTrigger;
  conversation?: { mode: "fresh" | "continue" };
  operations?: MissionOperationIntent[];
};

type MissionOperationIntent = {
  service: string;
  method: string;
  args?: unknown[];
  use: "action" | "conditional";
};
```

When `conversation` is omitted, the tool seals the current channel and context
as `mode: "continue"`. Explicit `fresh` creates a separate context for each
run. Use it only for a separate topic or deliberately independent background
work; it is not the default for an automation requested in an ongoing
conversation.

`operations` lists the external service calls you can predict at launch. Do not
supply capability names, permission rows, grants, runtime identities, or
channel IDs. The host compiles each operation against the receiver's live
method contract for durable pre-acquisition.

- `args` is the receiver's argument tuple, as you would pass it through the
  runtime client. Omit it for a method that takes no arguments.
- Leave out a context-bound method's `contextId` (for example, declare
  `vcs.status` with no `args`). The host compiler binds it to the author's
  context, exactly as the runtime wrapper does. An explicit `contextId` names
  another concrete context and is never a placeholder.
- Reading these arguments does not require looking up the executor's build,
  class, object key, or channel; the launch tool seals those itself.
- Include the predictable service calls a prompt action will make.
- The plan is not a runtime allowlist. Dynamic or accidentally omitted
  operations go through ordinary prompt-capable acquisition when invoked.
- Declare only external service methods the action invokes. The mission
  service itself handles scheduling, run admission, fresh-conversation
  creation, result delivery, and completion; the charter and admission already
  cover those. Never declare made-up operations such as `missions.finishRun` or
  `chat.publish`.

Model-facing agent tools are not eval JavaScript globals. A `tool` action invokes
the exact selected tool registration with object arguments, without a model turn;
its registered parameter schema, replay policy, and cancellation lifecycle apply.
The tool name is preserved exactly, including dots and hyphens. A name that is
not selected by that agent fails rather than adding authority or tools.
`notify` is not translated into its internal service calls. Eval actions
import the `@workspace/runtime` APIs they use. An eval publishes its return
value into the run conversation; returning `automation-completion.v1` also
completes the recurring mission.

`action.text` for a prompt action is the future turn's instruction, not its
final output. To send fixed text to the owner, use a `notify` action instead:
MissionsDO writes the owner's inbox entry (linked to this conversation) and
pushes it to their devices, with no model turn. `notify` requires
`conversation` mode `continue`. A failed inbox write fails the run; a failed
push does not, because the inbox entry is the delivery record.

The installed vessel fills in this image:

```ts
type MissionExecutionImage = {
  source: string;
  ref: `state:${string}`;
  effectiveVersion: string; // 64 lowercase hex
  className: string;
  objectKey: string;
};
```

## Lower-level charter

```ts
type MissionCharter = {
  summary: string;
  execution:
    | {
        kind: "method";
        image: MissionExecutionImage;
        method: string;
        args: unknown[];
        operations: MissionOperationIntent[];
      }
    | {
        kind: "agent";
        image: MissionExecutionImage;
        action:
          | { kind: "prompt"; text: string }
          | { kind: "tool"; tool: string; args: Record<string, unknown> }
          | {
              kind: "eval" | "watch";
              code: string;
              syntax?: "javascript" | "typescript" | "jsx" | "tsx";
              timeoutMs?: number;
              reset?: boolean;
            }
          | {
              kind: "notify";
              text: string;
              title?: string;
              alert?: "inbox" | "interrupt";
            };
        conversation:
          | { mode: "fresh" }
          | {
              mode: "continue";
              channelId: string;
              contextId: string;
              executorId: string;
            };
        operations: MissionOperationIntent[];
      };
  trigger: MissionTrigger;
};

type MissionTrigger =
  | { kind: "manual" }
  | {
      kind: "schedule";
      everyMs: number;
      anchorAt?: number;
      jitterMs?: number;
      untilAt?: number; // Exclusive UTC Unix epoch-millisecond deadline.
      maxRuns?: number;
    }
  | {
      kind: "cron";
      expression: string;
      timezone: string;
      untilAt?: number; // Exclusive UTC instant; timezone applies only to recurrence.
      maxRuns?: number;
    };
```

A method charter's root invocation is already covered by its image and method;
`operations` declares the further service calls that method can make. The
source ref and effective version are independent: the ref recreates the source
state, and the effective version identifies the compiled installed image.

## Launch and authority acquisition

The launch tool and the UI compile the plan once, as the authenticated author.
Code uses the `missions` runtime client, which does the same: it compiles the
plan as the caller, then calls the controller.

```ts
import { missions } from "@workspace/runtime";

const automation = await missions.launch({ name, charter });
await missions.edit(automation.missionId, { name: "Renamed" });
```

The content-addressed plan fixes the full execution intent, service arguments,
immutable image, and author lifecycle. The controller verifies the plan within
its own authenticated invocation; it never recompiles operations itself or
borrows the author's context graph. Authority depends on the executor mode:

- `continue`: the launch tool compiles the declared operations and starts
  acquisition for the authenticated current agent task before installing the
  schedule. Scheduled turns then use the agent's normal authority.
- `fresh` or `method`: MissionsDO registers the immutable mission revision and
  starts acquisition for its mission subject. The fresh agent, method, and
  child eval inherit that authority through execution admission.

Launch then:

1. Validate and seal the charter.
2. Ask the host to verify the supplied plan against its intent and the live
   author.
3. Persist an active revision and its authority-plan reference.
4. For an isolated executor, register `mission:<missionId>@<revisionDigest>`
   with the host, attributed to the requesting user.
5. Start durable acquisition for eligible gated leaves on the selected subject.
6. Return the active record with pending, granted, and denied request IDs.

The automation is active as soon as launch returns. Individual capability
decisions may still be pending; they belong to the mission revision and survive
the end of the launch execution and host restarts without duplicate cards.

For an isolated execution, MissionsDO asks the host for admission bound to the
revision, plan, image, executor, and idempotency key. Eval and service calls it
causes inherit that admission through the RPC authorization context. A
continuing turn gets no mission admission or nonce; it is normal input to the
existing agent. The authority plan records launch-time acquisition intent;
it does not allow or deny runtime calls.

If no matching standing grant exists, the dispatcher falls back to ordinary
acquisition, which can prompt. The agent or eval invocation waits for that
approval while the mission run stays `executing`. It is not limited to
pregranted authority, and MissionsDO does not run a second acquisition
lifecycle.

Editing only the name or cadence reuses the installed plan. `missions.edit`
compiles a new plan when the action, image, conversation, or operations change,
or when a seeded definition is customized (a new definition with a new author).
Each plan binds the exact invocation intent and its authenticated author.

Compilation does not give future executors access to the author's context
graph. Fresh and method executions still go through target admission and the
receiver's normal checks in their own execution context. Declare concrete
resources their runtime can actually use; unavailable or foreign contexts are
rejected, not inferred or expanded.

## Mission record

```ts
type MissionRecord = {
  schemaVersion: 3;
  missionId: string;
  name: string;
  revision: number;
  charter: MissionCharter;
  authorityPlan: {
    schemaVersion: 2;
    digest: string;
    artifactRef: `authority-plan:${string}`;
    compilerVersion: string;
    catalogDigest: string;
  };
  owner: { userId: string };
  state: "active" | "paused" | "completed" | "retired";
  revisionDigest: string;
  authority: {
    requestIds: string[];
    grantIds: string[];
    denialIds: string[];
  };
  createdAt: number;
  updatedAt: number;
  activatedAt: number;
  runCount: number;
  nextRunAt?: number;
  lastRunAt?: number;
  completedAt?: number;
  completionReason?: "until" | "max-runs" | "response";
  completionResponse?: string;
};
```

Lifecycle state is not part of the revision digest. Pause and resume therefore
preserve isolated mission grants and never revoke authority from a shared
continuing agent task. Editing an isolated automation's behavior creates a
new digest and mission subject; editing a continuing definition re-plans its
predictable operations for the existing agent task.

## Run record

```ts
type MissionRunRecord = {
  runId: string;
  missionId: string;
  missionSubject: `mission:${string}@${string}`;
  revision: number;
  trigger: "manual" | "scheduled";
  phase:
    | "admitted"
    | "execution-admitting"
    | "context-preparing"
    | "executor-preparing"
    | "dispatching"
    | "executing"
    | "terminal";
  outcome?:
    | "succeeded"
    | "completed-with-errors"
    | "failed"
    | "skipped"
    | "interrupted"
    | "cancelled";
  startedAt: number;
  runNumber?: number;
  finishedAt?: number;
  authoritySessionId?: string;
  channelId?: string;
  contextId?: string;
  executorId?: string;
  finalMessage?: string;
  completionResponse?: string;
  failure?: {
    code: string;
    stage: string;
    message: string;
    retry: "automatic" | "manual" | "none";
    invocationId?: string;
    acquisitionId?: string;
    executorId?: string;
    causalEventRef?: string;
    detailsRef?: string;
  };
  effectFailures?: Array<{
    invocationId: string;
    name: string;
    outcome:
      | "tool_error"
      | "infrastructure_error"
      | "cancelled"
      | "stale_dispatch"
      | "abandoned";
    code: string;
    message: string;
  }>;
};
```

Nonterminal phases are resumable checkpoints, not just UI status. Persist a
phase before its external effect, and reuse the phase's stable idempotency key
on recovery. Wake handling resumes existing nonterminal runs before admitting newly due runs.

`succeeded` means the turn and all of its child effects succeeded. If the agent
finished its turn but any child effect failed, the executor records
`completed-with-errors` and keeps `effectFailures`. This applies to every
effect; notification delivery is not a special case. Mission alerts are written
to the GAD inbox with retries; if the inbox is temporarily unavailable, the run
record still holds the outcome.

The RPC runtime tracks every outbound call made through direct clients,
request-scoped clients, and typed peers. An inbound execution stays active
until every RPC it started settles, even if its handler throws. Work that must
outlive the execution has to be journaled and admitted later under its own
execution identity.

## Methods

The `missions` client exposes each method below except the executor-only
`finishRun`. Its `launch` and `edit` compile the authority plan first, so
callers never pass one.

| Method      | Arguments                                          | Result                                               |
| ----------- | -------------------------------------------------- | ---------------------------------------------------- |
| `overview`  | `{ limit?, cursor?, filter?, query?, missionId? }` | paged definitions, counts, recent runs, and failures |
| `list`      | none                                               | visible definitions                                  |
| `get`       | `missionId`                                        | definition or `null`                                 |
| `listRuns`  | `missionId`, `{ limit?, cursor? }`                 | paged run ledger                                     |
| `getRun`    | `runId`                                            | exact run or `null`                                  |
| `launch`    | `{ name, charter }`                                | active definition                                    |
| `edit`      | `missionId`, `{ name?, charter? }`                 | active new revision                                  |
| `runNow`    | `missionId`                                        | new run record                                       |
| `pause`     | `missionId`                                        | paused definition with authority preserved           |
| `resume`    | `missionId`                                        | active same revision                                 |
| `retire`    | `missionId`                                        | retired definition                                   |
| `finishRun` | structured terminal result                         | `void`; executor-only                                |

`overview` returns aggregate counters in `stats` next to the requested
definition page:

- `stats.total`: visible automation definitions.
- `stats.active`, `stats.completed`: definitions in those states.
- `stats.running`: runs whose phase is not terminal.
- `stats.issueRunsLast24Hours`: runs started in the last 24 hours with an
  `outcome` of `failed` or `completed-with-errors`.

The counters cover the caller's whole visible ledger and ignore `limit`,
`cursor`, `filter`, `query`, and `missionId`. `completed` counts
definitions, while `issueRunsLast24Hours` counts runs.

The dashboard and chat inspector read these records directly. The chat pill
shows its launch snapshot until it is opened; each inspector open queries
`overview` for the current definition and recent runs. The inspector shows
failed child effects, declared pre-acquisition operations, and the host's
authority-plan reference; it does not rebuild a permission model in userland.
