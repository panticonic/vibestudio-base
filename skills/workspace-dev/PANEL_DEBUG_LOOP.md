# Panel Build, Debug, and Polish Loop

Use this workflow to create or edit a panel, diagnose real failures, inspect
how it renders, and deliver the requested result. Do only the steps the
observed state calls for; do not invent defects to demonstrate the workflow. If
the user explicitly asks for fault-injection or regression tests, keep the
intentional failures in an isolated candidate, check that the failed artifacts
stay inactive, and repair them before publication. Consult the larger API
references when a result needs deeper diagnosis.

## 1. Prepare once

For a new persistent app, write the authority policy described in
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

The application receipt is an object, not an array. It describes both units,
the service wiring, the context's working head after preparation, and the
policy you supplied. Code and config are prepared together, but
no commit, push, activation, or grant has occurred. Customize and review this panel and
worker pair; do not register a second service.

For a standalone panel without a new store, supply its authority ceiling
explicitly:

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

Write these authority values for the task before calling the helper; neither
helper fills in missing requests. Never call either preparation API again to
recover an existing candidate. If you are unsure whether an edit landed,
check VCS status and the destination paths. Later build, open, screenshot, or
publication failures do not undo preparation. Recover publication with the
usual VCS receipts and retry rules; there is no scaffold-specific recovery
helper.

Before delivery, review the full authority envelope and the candidate diff,
verify the unit paths, and commit and push the reviewed candidate as described
in [WORKFLOW.md](WORKFLOW.md#review-verify-and-publish). The context-pinned UI
checks below can run before publication.

## 2. Author and read the compiler result

Edit source with `write`/`edit`. Build the working context, not main:

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

Fix the cited source diagnostics and rerun the same report. Group edits by
user intent; keep an unrelated UI problem separate only when it needs its own
review or verification.

## 3. Open the unpublished context build once

A panel builds from its own context. Without `contextId` it gets a new context
forked from yours and never sees your later edits, so share the current context
when you will rebuild the same handle across source operations. The explicit
`ref` is the same selection, recorded so `requestedRef` can be checked. Keep
the handle in scope:

```ts
import { openPanel } from "@workspace/runtime";

scope.panel = await openPanel(scope.panelSource, {
  contextId: ctx.contextId,
  ref: `ctx:${ctx.contextId}`,
  focus: true,
});
const observation = await scope.panel.observe();
if (observation.requestedRef !== `ctx:${ctx.contextId}`) {
  throw new Error(`Wrong panel ref: ${observation.requestedRef}`);
}
return observation;
```

Do not call `openPanel` again to refresh the panel; reuse `scope.panel`. It
also survives a kernel restart: scope persists the handle by id and reacquires
the same panel.

## 4. Inspect the rendered state

Acquire one generation-fenced CDP session for the current runtime incarnation
and return the panel handle's native screenshot result, either directly or
nested next to interaction receipts and checks. Either way, eval attaches the
image for you to look at without putting its bytes in JSON. Normally omit
`authority.requests` in eval; if you deliberately narrow it, `cdp.session()` needs
the `panel.inspect` request documented in `BROWSER.md`.

Acquire the CDP session or page in a read-write eval, even if the locator calls
afterwards only read text: the connection can also run scripts and change the
page, and a read-only eval cannot obtain that authority. To only look at the
panel, use a read-only eval that returns
`await scope.panel.cdp.screenshot({ format: "png" })`; to read the console, use
`await scope.panel.cdp.consoleHistory()`. Neither needs `cdp.session()`.

```ts
scope.panelSession = await scope.panel.cdp.session();
const page = scope.panelSession.page;
const roles = await Promise.all(
  (await page.getByRole("button").all()).map((item) => item.inspect()),
);
console.log(roles);
return await scope.panel.cdp.screenshot({ format: "png" });
```

Eval attaches the returned screenshot as image content. No temp file,
filesystem write authority, or follow-up `read` call is needed. Judge visual
defects from the screenshot, not from source or DOM text alone.

## 5. Apply UI changes and rebuild the same panel

Make the source edit and rerun the build report for the context.

A visible improvement must change the rendered interface; editing a README
does not improve the panel. After rebuilding, capture the interface and confirm
the intended text, layout, or interaction change on the new runtime:

```ts
scope.rebuildObservation = await scope.panel.rebuild();
await scope.panelSession.page.title(); // Rebind the stable page after rebuild.
scope.refreshReceipt = scope.panelSession.receipt;
return {
  status: scope.refreshReceipt.status,
  generation: scope.panelSession.generation,
  phase: scope.rebuildObservation.phase,
};
```

Store this session receipt before running a separate UI probe. If the probe
fails, fix the locator and report the stored receipt together with the next
observed interaction. Return the full interaction outcome, or a summary that
keeps its protocol, delivery, and effect fields; do not drop them when you only
need to report, say, a new count.

`rebuild()` keeps the panel id and replaces the runtime incarnation. The session
and its page remain stable: the next page operation binds to the new incarnation,
and `scope.panelSession.receipt` reports `replaced`. An interaction interrupted
by replacement fails explicitly; the runtime never replays it.

Building, serving, connecting, and application boot are separate stages, and
cold builds can take a while. Do not put a fixed deadline on `rebuild()` or on
the eval cell around it. The runtime has no implicit readiness deadline and
reports terminal boot failures directly. Pass a signal only when the caller
really can be cancelled, for example because the user cancelled or a larger
workflow has an explicit end-to-end deadline, not as a precautionary timeout.
If that cancellation fires, call `scope.panel.diagnose()` in the next cell to
get the observation, boot failure, console history, and ready document without
rebuilding again. Then inspect a fresh screenshot the same way as in step 4.

## 6. Exercise the rendered contract

Use the accessible roles and names you just inspected. Do not guess labels from
source, and do not use `.first()`, `.last()`, or `.nth()` to act on repeated
items. Repeated controls must have item-specific names such as
`Complete Buy milk` and `Delete Buy milk`; fix the panel if they do not. Before
waiting on a narrowed locator, inspect the element it matches: `first()` picks
in document order and can choose a hidden option whose text also appears in a
visible heading. Use the observed role, name, and container. See
[BROWSER.md](BROWSER.md) for locator and wait semantics.

Exercise the application's data entry, update, filtering, and removal flows on
the rebuilt panel. Store each observed outcome in `scope` before starting the next
action so a later failure cannot erase earlier evidence. For an application
with persistent user data, reload through the panel handle and use the stable
page to check that the saved data survived.

Actions wait automatically for the control to be actionable, but dispatching
an action does not mean an asynchronous save, fetch, or React update has
finished. After each mutation, wait for its rendered completion before the next
dependent action:

- Use `click({ expect: { locator, state } })` or
  `press("Enter", { expect: { locator, state } })` when the expected condition
  follows that action.
- Otherwise call `waitFor({ state })` on the expected locator before reading it.
- For an asynchronous mutation you have not yet verified, wait for either the
  success state **or** the rendered error, then check which one happened.
  Waiting only for success leaves you stuck when the application has already
  shown an error. Use `page.waitForFunction` with a self-contained predicate
  that covers both the result and the visible error UI, or an `expect` locator
  that matches both terminal states.
- If an error is displayed, report it before any dependent action. A receipt
  showing the terminal state proves you observed it, not that the application
  behaved correctly.
- Never substitute sleeps or timeouts for a missing completion condition.

Prefer the action's `expect` option when reporting an interaction: the eval
journal keeps its target identity and semantic outcome even if you return only
a short summary. Detailed target inspection is on the returned interaction
receipt, not in the journal. A separate `waitFor()` does not turn a
dispatch-only receipt into an observed one. See [browser receipt
contracts](BROWSER.md#page-surface).

After a reload or reacquisition, wait for the application's loaded state;
its first loading state is not an empty database or a failure. Choose wait
conditions from the rendered UI. If an observation fails, inspect its
structured error, `panel.diagnose()`, and console history. Report a persistence
defect only when the loaded result contradicts the saved state or diagnostics
show the failure.

For new or restyled UI, also follow [theme
verification](WORKFLOW.md#theme-and-layout): inspect the light and dark
appearances, switch the host setting with the panel open, and restore the
previous setting. Check custom surfaces and open overlays, not only the theme
class. Finish by reading console events, capturing the final screenshot,
closing the page client, and returning compact evidence.

When the task includes performance, read `skills/performance/SKILL.md` and wrap
the interaction plus its real completion condition in `page.profile()`. Measure
precise JS coverage in a separate run, because coverage slows execution.

## 7. Commit and publish once

Read `skills/vibestudio-vcs/SKILL.md`, call `vcs.status` again, commit the
complete local application chain, and publish that committed event. If the
protected build gate fails, repair the source, rebuild, and commit a new event;
do not rerun the scaffold or push the rejected event again unchanged.

After publication, you can use `scope.panel.rebuild()` to check protected main,
but only after deliberately changing the panel's requested ref to main. Report
the requested changes, the visual review, build status, interaction evidence,
console errors, and the publication receipt.
