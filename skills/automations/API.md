# Automations API

Resolve `vibestudio.missions.v1` with `workers.resolveService(...)` and call its Durable Object target with `rpc.call(service.targetId, method, args)`. Prefer the native `launch_automation` tool for work owned by the current agent: it seals the installed execution image and conversation binding without guest-code identity discovery. Prefer `control_automation` for conversational pause/resume/run/remove requests; it resolves the owner-visible target and avoids guest-code service discovery.

## Native control

```ts
type AgentAutomationControl = {
  action: "pause" | "resume" | "run_now" | "retire";
  missionId?: string;
  name?: string;
};
```

Omit the target only when one eligible automation is active in the current
conversation. Otherwise pass one exact name or the `missionId` returned by
launch. Use `pause` for ordinary “stop” language; it is reversible. `retire` is
permanent and is reserved for explicit deletion. A user-authored request to
control their own automation is executed directly by the native tool and is
not routed through eval or a redundant approval card. Ownership and user
attribution are still checked by MissionsDO.

## Agent launch input

```ts
type AgentAutomationLaunch = {
  name: string;
  summary: string;
  action:
    | { kind: "prompt"; text: string }
    | {
        kind: "eval" | "watch";
        code: string;
        syntax?: "javascript" | "typescript" | "jsx" | "tsx";
        timeoutMs?: number;
        reset?: boolean;
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

When `conversation` is omitted, the native tool seals the current channel and
context as `mode: "continue"`. Explicit `fresh` creates a separate context for
each run. Use that only for a separate topic or intentionally independent
background work; it is not the default for an automation requested in an
ongoing conversation.

Operations express concrete external service calls predictable at launch. Do not supply
capability names, permission rows, grants, runtime identities, or channel IDs.
The host compiles each operation against the live receiver-owned method contract
for durable pre-acquisition. Include predictable service calls selected by a
prompt action. The artifact is not a runtime allowlist: genuinely dynamic or
accidentally omitted operations use ordinary prompt-capable acquisition when
actually invoked.

Model-facing agent tools are not eval JavaScript globals. `notify` remains a
prompt tool and is not translated into its internal service implementation.
Eval actions import the ordinary `@workspace/runtime` APIs they use.

`action.text` for a prompt action is the future turn's instruction, not its final output. Keep the semantic verb from the user's request: “Notify the owner with the exact text …” is a notification instruction, while the bare text alone is only a request for an ordinary chat response.

Only external service methods invoked by the action belong in `operations`.
The mission service itself owns scheduling, run admission, fresh-conversation
creation, result delivery, and completion settlement. Those intrinsic effects
are already sealed by the charter and admission, so never declare synthetic
operations such as `missions.finishRun` or `chat.publish`. An eval publishes its
ordinary return value into the run conversation; returning
`automation-completion.v1` additionally completes the recurring mission.

The installed vessel fills this exact image:

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
          | {
              kind: "eval" | "watch";
              code: string;
              syntax?: "javascript" | "typescript" | "jsx" | "tsx";
              timeoutMs?: number;
              reset?: boolean;
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
      untilAt?: number;
      maxRuns?: number;
    }
  | {
      kind: "cron";
      expression: string;
      timezone: string;
      untilAt?: number;
      maxRuns?: number;
    };
```

A method charter’s own root invocation is already sealed by its image and method;
`operations` declares the additional service effects reachable from that method.
The source ref and effective version are independent immutable facts: the ref
recreates source state; the effective version identifies the compiled installed image.

## Launch and authority acquisition

`launch({ name, charter })` performs one idempotent durable launch. Authority
depends on executor mode:

- `continue`: the native launch tool compiles the declared operations and
  initiates acquisition for the authenticated current agent task before
  installing the schedule. Scheduled turns then use ordinary agent authority.
- `fresh` or `method`: MissionsDO registers the immutable mission revision and
  initiates acquisition for its mission subject. The fresh agent, method, and
  child eval inherit that authority through execution admission.

The durable launch then:

1. Validate and seal the charter.
2. Ask the host to compile a content-addressed authority plan.
3. Persist an active revision and its authority-plan reference.
4. For an isolated executor, register `mission:<missionId>@<revisionDigest>` with the host under the attributed requesting user.
5. Start durable acquisition for eligible gated leaves on the selected subject.
6. Return the active record with pending, granted, and denied request IDs.

Launch institution is immediate. Individual capability decisions may still be pending; they target the durable mission revision and survive the launch execution and host restart without duplicate cards.

For an isolated execution, MissionsDO asks the host for admission bound to the
exact revision, plan, image, executor, and idempotent key. Causal eval and
service calls inherit it through ordinary RPC authorization context. A
continuing turn receives no mission admission or nonce; it is ordinary input to
the existing agent. The authority plan records launch-time acquisition intent;
it does not allow or deny runtime calls.

If no matching standing grant exists, dispatcher acquisition follows the ordinary prompt-capable path. The concrete agent/eval invocation owns that approval wait while the mission run remains `executing`; it is not restricted to pregranted authority and MissionsDO does not copy a second acquisition lifecycle.

## Mission record

```ts
type MissionRecord = {
  schemaVersion: 3;
  missionId: string;
  name: string;
  revision: number;
  charter: MissionCharter;
  authorityPlan: {
    schemaVersion: 1;
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
continuing agent task. Editing isolated behavior creates a new digest and
mission subject; editing a continuing definition re-plans predictable
operations for the existing agent task.

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

Nonterminal phases are resumable checkpoints, not UI-only status. Persist a phase before its external effect and reuse the phase’s stable idempotency key on recovery. Wake handling resumes existing nonterminal runs before admitting newly due runs.

`succeeded` means both the turn and all of its terminal child effects succeeded.
If the agent recovered enough to finish its turn but any child effect failed,
the executor records `completed-with-errors` and preserves `effectFailures`.
This distinction is generic; notification delivery is not special-cased.
Mission attention is a retryable projection into the ordinary durable GAD
inbox; the mission run remains the canonical outcome if that projection is
temporarily unavailable.

The RPC runtime observes every outbound operation through direct clients,
request-scoped clients, and typed peers. An inbound execution remains active
until every RPC it started settles, including when its handler throws. Work
intended to outlive that execution must be journaled and admitted later under
its own execution identity.

## Methods

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

The dashboard and chat inspector consume these records directly. The chat pill
is a launch snapshot only until opened; every inspector open queries `overview`
for the canonical definition and recent runs. They show failed child effects,
declared pre-acquisition operations, and the host authority-plan reference
rather than reconstructing a permission model in userland.
