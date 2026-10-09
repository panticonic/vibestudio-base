---
name: capabilities
description: Declare, discover, inspect, or debug authority grants, workspace services, and provider-owned capabilities.
---

# Capabilities and workspace services

Read this before adding a host effect, worker/DO API, authority request, or
approval step. For host enforcement, automation execution, product seeds, or
the System Agent, also read the
[authority implementation checklist](references/authority-implementation-checklist.md).
For browser-panel access, connection consent, website identity, and resource
escalation, read [website authority](references/website-authority.md).

## Authority layers

1. **Method contract**: principals, receiver/resource derivation, effect,
   sensitivity, and tier.
2. **Authority manifest**: the most gated/critical authority an installed unit
   may request. A request is not a grant.
3. **Host grant or fresh approval**: authorizes an eligible request. Open
   methods need no grant, but website callers must still be connected,
   eligible, and meet any website resource requirement. Critical effects need
   a fresh decision.
4. **Provided capability**: a workspace provider protects a resource it owns;
   the receiver enforces it before provider code runs. Downstream host effects
   (credentials, egress, publication, browser) stay separately protected.

Discovery, generated docs, builds, censuses, and observed calls never grant
anything. Generated authority catalogs are review evidence; admission comes
from a decision about the sealed unit and its manifest.

## Inspect or acquire authority

Use live docs for `permissions`, `authority.preflight`, and the target
method's contract. The permission inventory is read-only; change decisions
only through the host surface that owns them.

Let the real protected operation go through normal acquisition. Don't request
authority from provider code, probe with a broader call, or retry through
another caller. Use preflight only when you need the outcome before the
effect.

When the user allows **only** specific access, use eval's `authority.requests`
as the ceiling. Call `authority.preflight` with the service, method, and
arguments; each non-open leaf returns `capability` and `resourceKey`. Request
each as `{capability, resource: {kind: "exact", key: resourceKey}}`, and set
`effects: "read-only"` if asked. `preauthorize` prepares the declared calls
but doesn't limit the rest of the run. An empty `requests` list denies
protected calls even if a grant exists or the call is listed for
preauthorization.

Opaque preparation handles identify provider-owned state but don't authorize
it. Create them with the declared handle mechanism and bind consumers to the
matching capability and argument. Never accept or invent a raw selector
instead.

## Author a dynamic workspace service

Workspace services resolve from the caller's semantic context, not a startup
scan or static catalog.

For a new persistent app, `prepareApplication` from
`@workspace-skills/workspace-dev` takes explicit unit manifests, service
policy, complete literal receiver contracts, and a rationale. It prepares
connected code and config without inferring requests or publishing. Review
the full envelope, verify it, then commit and push separately; don't register
the service again. See [connected scaffolding](../workspace-dev/PROJECTS.md).

For existing or custom providers:

1. Add the provider method with an explicit `@rpc` receiver contract.
2. Use `workspace_service` with `operation: "upsert"` to update the service
   and singleton declaration together, supplying presentation, notability,
   principals, protocol, source, and transport per its schema. Don't edit
   these YAML lists by hand.
3. Find it with the `docs_search` and `docs_open` agent tools. If it's
   missing, fix the declaration or build; don't poll or guess a route.
4. In eval, resolve the protocol and call the returned target:

   ```ts
   import { rpc, workers } from "@workspace/runtime";

   const service = await workers.resolveService("example.protocol");
   if (service.kind !== "durable-object")
     throw new Error("Expected a Durable Object service");
   return rpc.call(service.targetId, "methodName", []);
   ```

Updating the declaration of an existing service doesn't update its live RPC
receiver when the provider method changed in source. Verify the context
candidate, commit and publish the provider repository, wait for publication,
then resolve the service again. See
[worker and Durable Object guidance](../workspace-dev/WORKERS.md).

`docs_search` and `docs_open` are agent tools, not eval globals or runtime
exports. Never source-scan another unit to rebuild the service list or add
dynamic service names to a generated host catalog.

Use `workers.listServices()` only for a quick listing, then open the returned
docs ID before choosing a method. Use `resolveDurableObject(...)` only for
objects whose lifecycle you own, addressed by source, class, and key.

## Protect provider-owned resources

Declare local capabilities in `authority.provides` and bind each protected
receiver through its `@rpc` effect or extension method authority. Use the
declared receiver resource for simple values and opaque handles for private
provider state.

An installed consumer requests `workspace-service:<name>` in its manifest.
Evaluated code has no manifest ceiling, but live selection, task/mission
admission, session grants, receiver policy, context lineage, and content
integrity still apply.

Never mark a protected method open to cover for a missing service declaration
or consumer request; fix the contract.

## Author an executable unit request

For a panel, worker, app, extension, or package doing gated or critical work:

1. Find the typed operation and resource in live docs.
2. Add a narrow request to `package.json#vibestudio.authority.requests`.
   Don't request open methods or host lifecycle plumbing.
3. Use the narrowest identity, origin, domain, or deliberate prefix. Never use
   a wildcard to silence a build error.
4. Request `build.getBuildReport` for the unit at the exact `ctx:<contextId>`
   working state. Its TypeScript and static authority diagnostics report
   missing requests for statically known calls. The check doesn't write the
   manifest or grant anything; protected push repeats it against the exact
   candidate. A plain runtime build is not this check.
5. Run the real code path. On denial, follow the structured remediation
   instead of catching `EACCES` and trying another route.

Version-bound grants follow the exact execution digest, so a shared library
change changes the reviewed identity of every executable using it. Carry the
reviewed identity into activation; don't add approvals at build, startup, or
first use.

## Relationship authority

Panel-tree placement is presentation, not authority. Launch ancestry, which is
immutable, can prove control over runtimes a panel, its agent, or that agent's
eval created. Moving an unrelated panel into a collection transfers no
relationship or context authority.

Never pass capabilities through ancestors, descendants, or reparenting. Have a
coordinator spawn the resources it should control; otherwise keep the
provenance and use the context-boundary decision.

## Content integrity, missions, and product agents

Content provenance is an authority input. The host stamps files and durable
messages when written and advances the reading session's one-way integrity
latch on read. Never accept a caller-supplied content class, copy content to
hide its origin, or invent or parse lineage-set coordinates. Use
`contextIntegrity.explain` for bounded diagnostics from the current session.

A continuing automation wakes its existing agent and uses that conversation
task's authority. A fresh-agent or non-agentic automation revision is a
durable mission principal over a fixed charter and a host-compiled authority
plan. Userland declares semantic service operations, never capability rows.
The host derives capability and resource leaves from receiver contracts,
stores the immutable plan, and acquires eligible grants for the task or for
`mission:<id>@<revisionDigest>`. Editing an isolated mission creates a new
subject. Pausing stops new admissions but revokes no grants.

Mission admission binds the isolated subject and plan provenance to one
authenticated agent turn, eval run, or method invocation; a continuing turn
uses normal task execution. Child calls inherit the caller's authorization
context. Channel IDs are routing facts, never authority subjects. Missing
runtime authority goes through normal acquisition; don't force automation
eval into `pregranted-only` mode. The plan predicts launch-time acquisition;
it doesn't authorize, deny, or expose the structure of a runtime call.

The RPC runtime keeps an admitted parent active until every outbound call it
started settles (direct clients, request-scoped clients, and typed peers),
even if the handler throws. Don't use `waitUntil` or a floating promise to
inherit authority. Work that should start after the parent closes must be
persisted and admitted as a new execution.

The System Agent is a product-owned mission with a product-derived worker,
prompt, roster, tools, and execution identity, using normal typed services in
eval. Never give it a special transport, receiver bypass, approval channel,
workspace prompt injection, self-grant path, or credential extraction route.
See the checklist for its invariants.

## Diagnose a denial

Read the live method and provider contract, then follow the structured reason
and remediation:

| Outcome                                                               | Action                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Missing grant/content-lineage decision with user-approval remediation | Let acquisition request the decision. Retry only after it resolves.                     |
| Installed code didn't request the capability                          | Add a narrow request to the manifest and submit a newly sealed unit for review.         |
| Undeclared receiver                                                   | Add or fix the provider's reviewed receiver contract. Caller grants can't authorize it. |
| Principal, relationship, session, attestation, or explicit denial     | Final for that invocation; follow its remediation.                                      |

Inspect sealed build metadata and execution identity, not just current source.
Keep structured errors and the original caller across internal calls. Unknown
schemas, missing provider declarations, missing provenance, and unclassified
authority fail closed.
