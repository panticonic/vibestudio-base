# Authority implementation checklist

Use this checklist for host enforcement and cross-component authority
changes. The capabilities skill covers the userland authoring loop; this
reference lists the host review inputs that must stay explicit.

## Add or change a host service method

1. Define a strict schema in `packages/service-schemas`. Reject unknown fields
   at the boundary, and keep caller, session, and owner identity out of the
   arguments when the host can derive them.
2. Declare the receiver contract on the service definition: admitted principal
   kinds, relationship/resource derivation, sensitivity, and effect.
3. Assign the reviewed tier (open, gated, or critical) on the same method
   schema. Tier is a property of the method; don't infer it from current
   callers.
4. Map the method to a semantic capability on the method schema. Several
   transport methods may share one user decision.
5. Give every promptable static host method plain-language `presentation`
   copy on its schema, describing what the user allows rather than the RPC
   verb. Use `{requesterKind}` only for the panel, worker, app, extension, or
   agent kind; display identity and immutable authority identity are separate
   fields. The read-only projection is
   `packages/shared/src/authority/hostAuthorityCatalog.generated.ts`.
6. Implement the handler without taking authority facts from arguments, and
   pass the verified caller and authorization context to downstream calls.
7. Update the receiver-review input in `scripts/runtime-authority-review.json`.
   Its census digest detects drift; the per-method rationale is the human
   review. Regenerating derived ledgers is not approval.
8. Test admitted and rejected principal/relationship/resource cases,
   malformed schemas, capability grouping, tier and presentation coverage, and
   downstream caller preservation.

Copy for dynamic workspace services doesn't go in the host presentation
census. Put its `title`, `action`, and `description` in the live workspace
service declaration, which live docs and resolution both read.

## Website admission and effect review

See [website authority](website-authority.md) for the full contract. Review
method eligibility separately from tier: a missing annotation must fail at
definition, and a closed annotation needs a concrete reason. Verify no
workspace I/O before explicit connection, saved origin grants on fresh
documents, document/generation revocation, and correct approval origin and
duration copy on desktop and mobile.

Test website attribution and liveness at downstream effect and response
boundaries, including streams, callbacks, queued work, and cross-workspace
calls. Derive resource scope at the resource's owner, including canonical
paths and the resources behind file handles. Treat privately retained data
separately from the response audience. Passing bulk annotations and
synchronous RPC tests doesn't mean the inventory is reviewed or the product
complete.

## Add or change an executable workspace unit

1. Put the installed unit's gated/critical requests in its checked-in
   `package.json#vibestudio.authority.requests`.
2. Build the semantic context. The build seals the manifest and dependency
   closure but never writes or approves it.
3. Review the effective version: source, transitive dependencies, runtime
   ABI, and direct requests.
4. Show added human-readable capabilities first, keep unchanged ones
   collapsed, and summarize removals. One version decision covers code plus
   its full authority contract.
5. Carry the admitted identity into activation; don't ask again at build,
   startup, or first use.
6. On a fresh workspace, batch all unreviewed executable units into one
   progressive-disclosure startup decision, not one prompt per unit or
   capability.

Static census generation suits shipped host methods. Workspace-built services
and intra-workspace capabilities are per context: declare them in the
semantic workspace, find them through live docs, and resolve them through the
live service registry. Never regenerate a static host catalog to approve
workspace code.

## Change a mission

These form one contract:

- the immutable execution image;
- action, conversation mode, and trigger;
- semantic operation intents;
- the host-compiled, content-addressed authority plan used for
  pre-acquisition, with compiler and catalog versions;
- the durable subject `mission:<id>@<revisionDigest>` and its attributed
  owner;
- durable target authority requests and grants;
- generic executor admission and causal inheritance.

The host compiler, not userland, derives capability/resource leaves from
receiver contracts. Store the canonical plan body under its digest; never
trust a body supplied by the mission store or recompile an old revision
against a newer catalog during admission.

Launch registers the subject and starts acquiring eligible standing grants.
Pending requests belong to the revision, survive the launching execution and
host restarts, and are deduplicated by revision plan plus compiled operation.
Runtime misses still go through normal acquisition and may park the
invocation.

Editing creates a new revision subject: block new admissions to the retired
subject, end its live executions, then revoke its grants. Pausing isn't
retiring; it stops new runs and keeps the subject and grants.

Execution admission must represent agent-turn, eval, and method executors in
one authenticated schema with an idempotent admission key, execution image,
policy digest, parent derivation, renewal owner, and terminal closure. Don't
add a separate transport for one executor kind or bind authority to a
channel ID.

Track outbound calls caused by an execution in the generic RPC core,
including direct, request-scoped, and typed-peer calls. When a parent closes,
block new children only after every call it already started has settled, on
handler success and failure. Delayed or background work that hasn't started
is a separate durable execution and must not inherit an expired parent
through `waitUntil`.

Keep terminal child-effect failures through turn closure. A mission run is
`succeeded` only if its turn and every terminal child effect succeeded;
otherwise `completed-with-errors` with the invocation evidence, or `failed`
if the turn itself failed.

## Change a product-seeded mission

Seed files are strict, checked-in, reviewed inputs in the host's seed
directory. Resolve `@seed` harness and skill hashes only from immutable
product snapshot outputs. Key reconciliation by the product snapshot state and
keep the host/system owner. When the snapshot changes, create and activate a
new revision, block new admissions to the old one, let its executions finish,
and only then revoke its grants.

Don't read mutable workspace source to build a product seed, and don't add a
compatibility or repair path for old schemas: migrate forward and fail closed
on unknown schemas.

## Change the System Agent

These invariants form one boundary:

- one deterministic conversation per workspace, authenticated user, and
  immutable product snapshot;
- host-derived context, channel, agent key, and locked membership;
- a product-blessed worker effective version and execution digest;
- the product prompt and eval handbook;
- no workspace prompt override, skill injection, or memory recall;
- exactly `eval` and `notify` as model-facing tools;
- the normal typed service/runtime APIs inside eval;
- no non-delegated approval payload or settlement;
- no delegation activation, renewal, or widening from conversation eval;
- no self-blessing, self-grant mutation, or credential extraction;
- desktop and mobile clients call the same typed lifecycle service.

A missing shell feature doesn't justify a System Agent bypass. Add or improve
the shared semantic service, receiver contract, presentation, and mission
exposure so normal clients and the System Agent use the same boundary.

## Verification

Run the narrow deterministic tests first, then:

1. authority manifest and runtime receiver-review checks;
2. host, workerd, userland, and mobile type checks;
3. host and workspace test suites;
4. desktop and mobile approval/lifecycle coverage;
5. Iroh remote-transport smoke tests;
6. vague model-backed system tests, only when model capacity is available.

Model-backed failures point at infrastructure, APIs, or guidance. Don't make
prompts more prescriptive to work around a platform defect, and don't raise
optional eval or model-stream timeouts. A terminal infrastructure failure must
settle the invocation and its turn.

At tool and service boundaries, keep structured error data and normalize the
terminal record to `agent-tool-failure.v1`. The original operation failure is
always the primary cause; cleanup, rollback, and transport failures are
secondary evidence. Include causal IDs and a typed retry policy when known.
Never make prose parsing, a cleanup throw, or a second error channel part of
control flow.
