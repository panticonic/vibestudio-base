# Panel Build, Debug, and Polish Loop

Use this workflow to create or edit a panel, diagnose actual failures, inspect
its rendered behavior, and deliver the requested result. Select the steps that
the observed state requires; do not invent defects merely to demonstrate the
workflow. Explicitly requested fault-injection or regression tests are different:
keep intentional failures in an isolated candidate, verify that failed artifacts
remain inactive, and repair them before publication. Read the larger API
references when an observed result needs further diagnosis.

## 1. Prepare once

For a new persistent app, author the explicit authority policy from
[PROJECTS.md](PROJECTS.md), then prepare the connected candidate:

```ts
import { prepareApplication } from "@workspace-skills/workspace-dev";
scope.prepared = await prepareApplication({
  name,
  title,
  authority: scope.authorityPolicy,
});
scope.panelSource = scope.prepared.panel.created;
scope.workerSource = scope.prepared.worker.created;
return scope.prepared;
```

The application receipt is an object, not an array. It exposes both units,
service wiring, the exact context preparation head, and the supplied policy.
Code/config are prepared together, but no commit, push, activation, or grant
has occurred. Customize and review that existing pair instead of registering
a second service.

For a standalone panel without a new store, deliberately supply its ceiling:

```ts
import { prepareProjects } from "@workspace-skills/workspace-dev";
scope.prepared = await prepareProjects([
  {
    projectType: "panel",
    name,
    title,
    authority: scope.panelAuthority,
    authorityReason: scope.panelAuthorityReason,
  },
]);
scope.panelSource = scope.prepared[0].created;
return scope.prepared;
```

Author those authority values for the task before this invocation. Neither
helper fills missing requests. Never call either preparation API again to
recover an existing candidate. Inspect current VCS status and destinations
after an uncertain edit; later build, open, screenshot, or publication failures
do not roll preparation back. Follow ordinary VCS receipts/retry policy, not
a scaffold-specific publication recovery helper.

Before delivery, review the complete authority envelope and candidate diff,
verify exact unit paths, and commit/push the exact reviewed candidate as
described in [WORKFLOW.md](WORKFLOW.md#review-verify-and-publish). Context-pinned
UI verification below can happen before publication.

## 2. Author and observe the compiler result

Use `write`/`edit` for source. Build the exact working context, not main:

```ts
const report = await services.build.getBuildReport(
  scope.panelSource,
  `ctx:${ctx.contextId}`,
);
return {
  status: report.status,
  diagnostics: report.diagnostics,
};
```

Repair the cited source diagnostics, then rerun this same report. Keep an
independent UI problem separate when the requested work needs a distinct review
or verification boundary; otherwise group edits by their actual user intent.

## 3. Open the unpublished context build once

Panel activation defaults to the verified caller's context. Pin the current
context explicitly when retaining a handle across later source operations,
and retain its stable id:

```ts
import { openPanel } from "@workspace/runtime";

scope.panel = await openPanel(scope.panelSource, {
  contextId: ctx.contextId,
  ref: `ctx:${ctx.contextId}`,
  focus: true,
});
scope.panelId = scope.panel.id;
const observation = await scope.panel.observe();
if (observation.requestedRef !== `ctx:${ctx.contextId}`) {
  throw new Error(`Wrong panel ref: ${observation.requestedRef}`);
}
return observation;
```

Do not call `openPanel` again to refresh it. Reuse `scope.panel`. After a
reported kernel restart, recover the same panel with
`getPanelHandle(scope.panelId)` rather than opening another slot.

## 4. Inspect the rendered state

Acquire one generation-fenced session for the current runtime incarnation and
return the panel handle's native screenshot result directly. Omit an exact `authority.requests` list for
ordinary eval; if intentionally attenuating, `cdp.page()` requires the exact
`panel.inspect` request documented in `BROWSER.md`.

Run CDP session/page acquisition in a read-write eval even when the subsequent
locator calls only read text. The acquired connection can also execute scripts
and mutate the page; a read-only eval cannot acquire that authority. For visual
inspection without a CDP connection, use a read-only eval returning
`await scope.panel.cdp.screenshot({ format: "png" })`; console inspection can use
`await scope.panel.cdp.consoleHistory()`. Do not acquire `cdp.page()` first for
either bounded read.

```ts
scope.panelSession = await scope.panel.cdp.session();
const page = scope.panelSession.page;
const roles = await Promise.all(
  (await page.getByRole("button").all()).map((item) => item.inspect()),
);
console.log(roles);
return await scope.panel.cdp.screenshot({ format: "png" });
```

Eval attaches this canonical screenshot result as image content. No temp file,
filesystem write authority, or follow-up `read` call is needed. Do not infer the
visual defect from source/DOM text alone.

## 5. Apply UI changes, rebuild the same panel, and reacquire the page

Make the separate source edit and rerun the exact-context build report.

A visible improvement must change the rendered interface. Editing a README
does not improve the panel UI. Capture the changed interface after rebuilding
and confirm the intended text, layout, or interaction change on the new runtime:

```ts
scope.rebuildObservation = await scope.panel.rebuild();
scope.refreshReceipt = await scope.panelSession.refresh();
scope.panelSession = scope.refreshReceipt.session;
return {
  status: scope.refreshReceipt.status,
  generation: scope.panelSession.generation,
  phase: scope.rebuildObservation.phase,
};
```

Keep this replacement receipt before a separate UI probe. If that probe fails,
recover the locator and report the retained replacement receipt with the next
observed interaction. Return the full interaction outcome or a bounded
projection preserving its protocol, delivery, and effect; do not discard those
coordinates when reporting only the new count.

`rebuild()` keeps the panel id but replaces its runtime incarnation, so an old
page must not be reused. A generation-fenced session reports `replaced` when
that happens and returns the page for the new immutable attempt; it never
replays an uncertain interaction. Acquire the initial session with
`scope.panelSession = await scope.panel.cdp.session()`. Building, serving,
connecting, and application boot are
distinct stages and cold builds can legitimately take time; do not impose a
generic fixed deadline on `rebuild()` or on the surrounding eval cell. The
runtime has no implicit readiness deadline and reports terminal boot failures
directly. Pass a signal only when the caller owns a real cancellation boundary
(for example, a user cancelled the operation or a larger workflow has an
explicit end-to-end deadline), not as a speculative safety timeout. If such a
caller-owned cancellation fires, call `scope.panel.diagnose()` in the next cell
to retrieve the exact observation, boot failure, console history, and ready
document without rebuilding again. Inspect a fresh screenshot after the change
using the same native image result as in step 4.

## 6. Exercise the rendered contract

Use the accessible roles/names you just inspected. Do not guess labels from
source and do not use `.first()`, `.last()`, or `.nth()` for repeated item
actions. Repeated controls must have item-specific names such as
`Complete Buy milk` and `Delete Buy milk`; repair the panel if they do not.

Exercise the application's data-entry, update, filtering, and removal flows
against the fresh page. Retain each observed outcome in `scope` before starting
the next action; a later failure must not erase earlier successful evidence.
For an application with persistent user data, reload through the panel handle,
refresh the generation-fenced session, and verify that the saved data survives.
Actions auto-wait for an actionable control; dispatch does not establish that
an asynchronous save, fetch, or React update finished. For each mutation,
observe its rendered completion condition before another dependent action.
Use `click({ expect: { locator, state } })` or `press("Enter", { expect: { locator, state } })`
when the expected condition follows that action, or the expected locator's
`waitFor({ state })` before reading it.
Prefer the action's explicit `expect` when reporting an observed interaction:
the native eval journal retains its target identity and semantic outcome even
when you return only a compact summary. Rich target inspection remains on the
returned interaction receipt, not the journal. A separate `waitFor()` does not promote
a dispatch-only receipt to an observed one. See [browser receipt contracts](BROWSER.md#page-surface).
After reload/reacquisition, wait for the application's loaded result rather
than treating its first loading state as an empty database or a failure.
Choose conditions from the delivered UI, not elapsed sleeps. If an observation
fails, inspect its structured error, `panel.diagnose()`, and console history;
report a persistence defect only when the loaded result contradicts the saved
state or diagnostics establish the failure. For newly authored or restyled UI,
also follow [theme verification](WORKFLOW.md#theme-and-layout): inspect light and
dark appearances, switch the host choice with the same panel open, and restore
the prior setting. Check custom surfaces and open overlays, not just the theme
class. Finish by reading console events,
capturing the final screenshot, closing the page client, and returning compact
evidence.

When the task includes performance, read `skills/performance/SKILL.md` and wrap
the exact interaction plus its real completion condition with `page.profile()`.
Run precise JS coverage separately from the latency measurement because
coverage changes execution cost.

## 7. Commit and publish once

Read `skills/vibestudio-vcs/SKILL.md`, reobserve `vcs.status`, commit the complete
local application chain, and publish that exact committed event. A failed
protected build gate means repair source, rebuild, and commit a new event; it
never means rerun scaffold or blindly push the rejected event.

After publication, `scope.panel.rebuild()` may be used to verify protected main
only after its requested ref has deliberately been changed to main. Report the
requested changes, visual review, exact build status, interaction
evidence, console errors, and publication receipt.
