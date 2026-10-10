# CDP Panel Automation

Every panel-tree target supports CDP automation through `PanelHandle`. Use the
top-level `panelTree` to reach existing panels; `workspace.panelTree` is not
part of the runtime surface. For web browsing or website automation, open or
reuse a dedicated browser panel. Existing workspace panels, especially chat
panels, are applications: inspect them when that app is the target, but do not
use them as disposable web pages.

```ts
import { openPanel, openExternal } from "@workspace/runtime";

const handle = await openPanel("https://example.com", { focus: true });
const session = await handle.cdp.session();
const page = session.page;

await page.getByRole("button", { name: "Sign in" }).click();
await page.locator("input[name=query]").fill("Vibestudio");
await page.locator(".search-button").click();
await handle.click(".search-button"); // same session, convenience wrapper

// Lifecycle methods return the resulting PanelObservation. The same
// session.page keeps working afterwards; it binds the new generation.
await handle.navigate("https://other.com");
await handle.reload();

await openExternal("https://docs.example.com");
await session.close();
```

This file is the complete CDP reference. Eval-specific notes (scope, headless
roots, inline UI controllers, viewing screenshots) live in
[sandbox/BROWSER_AUTOMATION.md](../sandbox/BROWSER_AUTOMATION.md).

`locator.inspect()` inspects an element; `handle.observe()` inspects the panel
lifecycle. There is no `page.inspect` or `handle.browser.inspect`. Before the
first interaction, find the real roles and computed accessible names with
`getByRole(role).all()` and `locator.inspect()`; descendant text and badges are
part of accessible names, so do not guess them from visual labels or source.

Single-element locator actions and reads require exactly one match. With
several matches they fail immediately with `cdp_locator_ambiguous`, reporting
the match count and a bounded list of accessible names. They never pick the
first control or wait for the ambiguity to resolve. Inspect the controls, then
narrow by exact accessible name or by a containing region. Collection
operations such as `count()`, `all()` and `evaluateAll()` still operate on all
matches. A select's associated label excludes its option text.

`first()` and `nth()` select by document order, including hidden matches, so a
text query can match a hidden select option before a visible heading. Before
waiting on a narrowed locator, use `count()` and `inspect()` to confirm its
role, name and visibility, then select the observed control or heading by role
and scope. A heading's accessible name can include a child count; use the name
you observed.

Drive multi-step flows from the current view. Open a dialog or editor before
addressing its fields, and confirm the resulting view before issuing dependent
actions. On `cdp_locator_state_mismatch`, read the captured snapshot and match
evidence, then either perform the missing transition or choose a locator for
the view that is actually shown. Repeating the action or raising its timeout
will not make a missing UI transition happen.

For normal eval calls, omit `authority.requests`; the run uses the authority
already admitted for the agent. If the workflow deliberately passes an
exhaustive per-run allowlist, `handle.cdp.session()` requires `panel.inspect` for
the handle's panel (the capability is `panel.inspect`):

```ts
eval({
  code: `const session = await scope.panel.cdp.session(); return await session.page.title();`,
  authority: {
    effects: "read-write",
    requests: [
      {
        capability: "panel.inspect",
        resource: { kind: "prefix", prefix: "" },
      },
    ],
  },
});
```

`timeoutMs` is a top-level eval option next to `authority`, never a field
inside it. Eval has no default wall-clock deadline. Do not add one to panel
creation, readiness, or CDP work; use it only when the task has a real deadline
or deliberately probes behavior that may never settle. A supplied `requests`
array is exhaustive, so do not guess capability names. Omit it unless the task
calls for attenuation.

`handle.cdp.session()` returns the stable generation-fenced session and page,
driven by our workerd-native CDP client (`@workspace/cdp-client`). It records
the immutable `attemptId`, `runtimeEntityId`, and `buildKey` of its current
binding. Keep one session across a workflow; after lifecycle changes its stable
page rebinds at the next awaited operation. Do not import or install any
`playwright*` package, and do not import `@workspace/cdp-client` directly for
normal page work.

`handle.cdp` does not proxy page methods. `handle.cdp.evaluate()` does not
exist: acquire a session and call `session.page.evaluate(...)`. Page evaluation
returns the decoded callback value directly; do not append `.result?.value` as
you would with raw CDP.

The page implements the documented methods, not the entire Playwright API.

## Author a disposable page

For a small test document, open a browser panel at `about:blank` and pass the
HTML to `page.setContent(html)`. It replaces the main frame's document without
navigating, so no URL encoding is involved, and resolves once the browser has
committed the document. It works on browser panels only: a workspace panel's
document is its application, so `setContent()` rejects there with
`cdp_workspace_navigation_forbidden`. Edit the source and use the panel
lifecycle instead.

In eval, `openPanel(source, { lifetime: "invocation" })` archives the panel and
its subtree when the cell finishes, including on failure or cancellation. Use
`lifetime: "session"` to keep it across cells until the eval session retires.
Ownership begins when the slot commits, so boot failures are covered too.
Cleanup is joined and its failures reach the caller. For a narrower block, use
`await using`:

```ts
await using handle = await openPanel("about:blank"); // archived on block exit
const session = await handle.cdp.session();
try {
  const page = session.page;
  await page.setContent(`<button id="go">Go</button><p id="status">Ready</p>
<script>document.querySelector("#go").onclick = () => {
  document.querySelector("#status").textContent = "Done";
};</script>`);
  await page.getByRole("button", { name: "Go", exact: true }).click({
    expect: {
      locator: page.getByText("Done", { exact: true }),
      state: "visible",
    },
  });
} finally {
  await session.close();
}
```

Navigation is for browser panels. On a workspace app panel, `page.goto()`,
`page.reload()`, `page.goBack()`, and `page.goForward()` reject rather than
bypass the panel lifecycle. Use `await handle.reload()` to reload the current
renderer with its existing build and storage, or `await handle.rebuild()` after
source changes. Both return a `PanelObservation`; `handle` itself stays valid.

For bulk navigation, or imported browser tabs that should stay unloaded until
the user visits them, use `createPanelSlot(url)`. It commits the browser slot
and returns without focusing or waiting for the document. The slot observes as
`pending` and has no CDP generation. To load it for automation, call
`await handle.cdp.session()`: this loads the panel without changing desktop
focus, waits for application readiness, and fences the connection to that
generation. Raw CDP can mutate the page, so acquiring a session requires a
read-write eval. A read-only eval can use read helpers such as
`handle.cdp.screenshot()` and `handle.cdp.consoleHistory()` instead.

## Ownership and lifetime contract

`PanelHandle` owns the target; its one stable session owns the automation
connection to it.

- `await handle.cdp.session()` returns the panel's session, binding it to the
  current immutable panel generation. Every call returns the same object.
  `session.page` is stable: each awaited operation runs on the bound
  generation, and `session.generation` / `session.receipt` record which one.
- `handle.navigate()`, `handle.reload()`, and `handle.rebuild()` mark the
  session stale. Its next awaited operation re-observes the panel and binds the
  replacement, recording a `replaced` receipt. An operation already in flight
  when the generation changes rejects with `panel_cdp_generation_changed`
  (`errorData.previousGeneration` / `currentGeneration`); nothing is replayed.
- Listeners registered with `page.on()`, `page.consoleEvents()`, and locators
  created before the change belong to the old generation and do not carry
  across. A stale locator rejects with `panel_cdp_generation_changed`;
  re-register listeners and recreate locators after a `replaced` receipt.
  Synchronous reads (`url()`, `consoleEvents()`, `on()`) need a bound page:
  after a change, `await handle.cdp.session()` (or any awaited page operation)
  first.
- `await session.close()` disconnects only the automation client. It does not
  close, unload, navigate, or otherwise change the panel; the next operation
  connects again.
- Eval is a notebook kernel. A page stored in `scope` stays the same live object
  across cells while the kernel activation is resident; idle time does not pin
  the activation. Call `session.close()` explicitly when finished.
- Durable scope persistence is a recovery snapshot, not the live heap. The
  panel's stable `session` is persisted by identity and rehydrated if its panel
  still exists; use `session.page` after recovery to bind the page. Arbitrary
  class instances still need a stable identity and explicit reacquisition.
- `await handle.archive()` removes an owned panel subtree, which invalidates
  page clients connected to that target. `await using panel = await
openPanel(url)` archives it when the enclosing block exits.
- A handle obtained from `panelTree` is non-owned unless the current workflow
  created it. Closing your session is safe; closing the handle is not.
- Browser `page.goto()` and `page.setContent()` keep the same CDP target and
  connection.

```ts
const session = await handle.cdp.session();
try {
  const page = session.page;
  await page.getByRole("button", { name: "Add list" }).click();
  await page.getByPlaceholder("List name").waitFor({ state: "visible" });
} finally {
  await session.close();
}
```

Reuse one handle and its session per multi-step workflow. Repeated
`openPanel()` calls without the same `operationId` create separate panels.
After a possible replacement, inspect `session.receipt` when generation status
matters.

For controlled React form controls, use the same path a person would. Focus the
control and use locator keyboard actions such as
`await page.getByRole("slider").press("ArrowRight")`, then assert the visible
result. Assigning `.value` and dispatching a synthetic `input` event only
changes the DOM property; it does not show that React accepted the interaction
or updated application state.

## Existing panels

Find existing panels with the bounded `panelTree.roots`, `panelTree.children`,
and `panelTree.search` calls, or address one with `panelTree.get`, instead of
opening duplicates. Use `rootOwners()` and `rootsForOwner(ownerUserId)` only
when deliberately inspecting another owner's panels.

```ts
import { panelTree } from "@workspace/runtime";

const result = await panelTree.search({ query: "New Panel", limit: 20 });
const target = result.hits
  .map(({ entry }) => entry.handle)
  .find((handle) => handle.source === "about/new");
if (!target) throw new Error("target panel not found");
const session = await target.cdp.session();
console.log(await session.page.title());
await session.close();
```

For a collection or other nested container, visit only the sibling groups you
need with a bounded work queue (`panelTree.children(rootId, { limit: 100 })`),
and restart the affected groups from their first page if the tree changes.
When the root is an `about/collection` panel, read the collection conductor
skill at `about/collection/SKILL.md` in the Personal workspace.

With a known slot id, observe before acting:

```ts
const handle = panelTree.get("panel-slot-id");
let observation = await handle.observe(); // exact attempt, host state, provenance
if (observation.phase === "pending") {
  observation = await handle.focus(); // materializes it; requires read-write authority
}
if (observation.phase !== "ready")
  throw new Error(`Panel is ${observation.phase}`);
```

Panel ids are plain strings and survive remounts, reloads, and storage; live
handles and pages do not. In panel or component code, persist the id (props,
state, or a channel value) and get the handle back with
`getPanelHandle(savedId)`, then call `handle.cdp.session()`. Eval scope keeps
handles and sessions by identity; see
[sandbox/EVAL.md](../sandbox/EVAL.md#serialization).

Existing handles are non-owned: do not call `handle.navigate`,
`handle.reload`, or `handle.archive` on them unless asked. Do not call
`handle.navigate(url)` or `page.goto(url)` on the current chat panel, a parent
chat panel, or any other workspace panel unless the task is to replace that
panel. Open a browser panel for arbitrary URLs, login flows, scraping, and
browser navigation.

Ownership follows verified launch ancestry, not the panel's current position
in the tree. A panel, agent, or eval can control browser panels it launched
without a prompt for every operation, and a subtree owned by a collection can
share one explicit orchestration context. Finding an unrelated browser panel
in `panelTree`, or moving one under a collection, does not grant that control;
CDP access to a panel in another context still requires the context-boundary
approval.

`openPanel()` returns once the application is boot-ready, but the slot is
persisted before that. If `openPanel()` throws `PanelOperationError`, use
`error.failure.provenance.panelId` to inspect or archive that slot. Calling
`openPanel()` again creates a duplicate unless both calls pass the same
`operationId`.

## Native JavaScript dialogs

`alert`, `confirm`, `prompt`, and `beforeunload` pause browser execution.
Register `page.on("dialog", handler)` before the action that opens one. The
handler receives a dialog with `type()`, `message()`, `defaultValue()`,
`accept(promptText?)`, and `dismiss()`. Nothing is accepted or dismissed
automatically; make the decision explicitly. Remove a temporary handler with
`page.off("dialog", handler)` when the workflow ends.

Without a handler, blocked input or evaluation fails immediately with
`cdp_dialog_open`, which includes the dialog and a recovery instruction. The
connection stays usable. Inspect `page.dialog()`, respond to the pending
dialog, then check what the original action did. Do not repeat the click; it
may still be waiting on the dialog. Responding to a dialog that was already
closed or replaced fails with `cdp_dialog_closed`.

## Where it runs

The CDP client is workerd-native and runs in panels **and** in workers, DOs, and
server-side eval. It connects over a WebSocket to the panel's CDP endpoint, so
any context holding a panel handle can drive the page. Because
`openPanel`/`panelTree`/`getPanelHandle` are part of the portable runtime
surface in `@workspace/runtime`, server-side eval can create or look up a panel
handle directly and then automate it.

## Page surface

`session.page` is a Playwright-style page.
Actions auto-wait for the element to be visible, stable, and enabled, and
journal a `cdp-interaction-outcome.v1` receipt once the browser event is
delivered. `click()`, `dblclick()`, locator `press()`, and the checkbox actions
also return that receipt and accept an `expect` locator postcondition. Other
actions such as `fill()` return no receipt (`selectOption()` returns the
selected values); check their journal entry, and await a separate locator
assertion when needed. Delivery does not prove that application state changed;
with `expect`, the receipt reports the observed condition. Do not add sleeps
between `fill()`, `press()`, `click()`, or other sequential actions.

In eval, native panel operations are recorded automatically in
`details.operationJournal`; returning a summary does not discard them. An
interaction entry keeps the action, delivery, target selector and identity
(`found`, `tagName`, `id`, `role`, `accessibleName`), and `effect`. It omits DOM
ancestors, attributes, geometry, and repeated text; use the returned click
receipt or `locator.inspect()` when you need those. `effect.status:
"not-asserted"` proves dispatch only; use the `expect` postcondition below to
get `"observed"` evidence. A later `waitFor()` checks the UI but does not change
the click receipt.

The journal is bounded. `truncated: true` means entries are missing, not that
the action failed. Keep important outcomes in `scope`, return compact receipts,
and re-observe current state. Do not repeat a mutation to recreate missing
evidence, and do not conclude that a workflow completed from a partial journal.

Session acquisition and page rebinding also journal a `cdp.session`
operation. Its receipt has `status`, the selected `generation`, and, after a
reconnect or replacement, `previousGeneration`. These entries survive a later
exception in the same eval. Read `scope.session.receipt` after a page operation.
A replaced runtime is a new page and renderer-local state
may be gone; re-observe the UI before choosing a postcondition.

A failed assertion does not mean the action was not delivered; inspect the
resulting state before acting again. A dispatched action stays in the journal
even if its postcondition throws, with `effect.status: "not-observed"`, the
expected locator, and the requested state. `not-asserted` means no
postcondition was requested. Neither status claims that the application effect
was observed.

```ts
const session = await handle.cdp.session();
const page = session.page;

// Discover the live accessibility contract before choosing named locators.
const buttons = await page.getByRole("button").all();
const buttonSemantics = await Promise.all(
  buttons.map((button) => button.inspect()),
);
// Records include role, accessibleName, text, attributes, visibility, box,
// and nearest rendered ancestors (with their roles, names, and text).

// Locators
page.locator("css selector");
page.locator('text="Exact text"'); // compiled to the getByText semantic engine
page.locator("text=substring"); // compiled to non-exact getByText semantics
page.getByRole("button", { name: "Sign in", exact: true });
page.getByText("Welcome");
page.getByLabel("Email");
page.getByPlaceholder("Search");
page.getByTestId("submit");
page.getByAltText("Logo");
page.getByTitle("Close");

// Chaining
page.getByRole("listitem").filter({ hasText: "active" }).nth(2);
page.locator(".row").first();
page.locator(".row").last();
const rows = await page.locator(".row").all();

// Actions (auto-wait)
const saved = await page.getByRole("button", { name: "Save" }).click({
  expect: {
    locator: page.getByText("All changes saved", { exact: true }),
    state: "visible",
  },
});
// saved.effect.status === "observed" and saved.effect.state === "visible"
await page.locator(".item").dblclick();
await page.locator(".item").hover();
await page.getByLabel("Email").fill("user@example.com");
await page.getByLabel("Email").type("user@example.com");
await page.getByLabel("Email").clear();
await page.locator("input").press("Enter");
await page.keyboard.press("Control+A");
await page.keyboard.type("replacement");
await page.keyboard.insertText("inserted in one browser operation");
await page.setViewportSize({ width: 390, height: 844 });
page.viewportSize(); // synchronous current CSS viewport
const checked = await page.getByRole("checkbox").check();
// checked.effect.status === "observed"; checked.effect.state === "checked"
await page.getByRole("checkbox").uncheck();
await page.getByRole("checkbox").setChecked(true);
await page.getByLabel("Country").selectOption("US");
await page.getByLabel("Country").selectOption({ label: "United States" });
await page.locator("input").focus();
await page.locator("input").blur();
await page.locator(".far-below").scrollIntoViewIfNeeded();

// Reads / state
await page.locator(".modal").waitFor({ state: "visible" });
await page.locator(".row").count();
await page.locator(".badge").isVisible();
await page.getByRole("checkbox").isChecked();
await page.locator("button").isEnabled();
await page.locator("button").isDisabled();
await page.locator("input").isEditable();
await page.locator("a").getAttribute("href");
await page.locator("input").inputValue();
await page.locator(".title").innerText();
await page.locator(".title").textContent();
await page.locator(".row").allInnerTexts();
await page.locator(".row").allTextContents();
await page
  .locator(".row")
  .first()
  .evaluate((row) => row.textContent?.trim());
await page
  .locator(".row")
  .evaluateAll((rows) => rows.map((row) => row.textContent?.trim()));
await page.locator(".box").boundingBox();
await page.locator(".box").inspect();
```

`check`, `uncheck`, and `setChecked` dispatch at most one click, then wait
(within the action timeout) for the control to reach the requested state. This
supports controlled components whose handlers persist asynchronously; the click
is never replayed while waiting. They return the same interaction receipt as
`click` and `press`, and by default the receipt observes the requested
checked/unchecked state. `delivery: "not-needed"` means the control already had
that state and no pointer event was sent. An optional `expect` observes an
additional application postcondition. Locator `waitFor` and interaction
postconditions also accept `checked` and `unchecked`.

A successful action proves dispatch, not that the application finished its
asynchronous work. Before reading results or starting dependent work, await the
specific rendered effect with `click({ expect })` or the result locator's
`waitFor`. For mutations you have not yet verified, make the wait condition
cover the application's rendered failure too, and check which one occurred: a
success-only wait stays pending after a displayed failure. `waitForFunction` can
observe a self-contained success-or-error predicate. When the app displays a
failure, report that failure instead of continuing with dependent actions. See
the
[rendered-contract debug loop](PANEL_DEBUG_LOOP.md#6-exercise-the-rendered-contract).

Panel reload readiness covers the runtime boot handshake only; application
fetches may still be loading. Wait for the application's loaded state before
judging saved data. Reads taken while loading are intermediate, not a
persistence verdict. Diagnose a failed observation through its structured error
and the panel's lifecycle/console packet.

Choose roles from the element's semantics, not its label. A plain
`<input aria-label="Search tasks">` has the `textbox` role; `searchbox`
requires `type="search"` or an explicit matching role. A label containing
"Search" does not change the role. Use
`getByLabel("Search tasks", { exact: true })` when the label is the known
contract, or inspect the input type before choosing a role.

Named role locators match the whole normalized, case-sensitive accessible name:
`getByRole('button', { name: 'Active' })` does not match `Mark active…`. This
differs from Playwright's fuzzy default. Use a regex or `exact: false` for a
partial-name search. Duplicate exact names still raise an ambiguity error;
scope to their container instead of guessing. `getByLabel("Count")` can match
an output labelled "Count" and controls labelled "Increase count" or "Reset
count"; use `getByLabel("Count", { exact: true })` for the output and a button
role/name for each control. A postcondition must describe the action's actual
outcome: the visibility of a count output that already exists does not show
that the count changed. Wait for the expected new value, or for the
application's success or error state.

Other string locators default to normalized, case-insensitive substring
matching; `{ exact: true }` selects a case-sensitive whole-string match. Text
locators also accept a `RegExp`, which keeps its source and flags in the
browser. `fill()`, `type()` (which appends), `clear()`, and the checked-state
actions set values through the element's native property setter before
dispatching browser events, so controlled React inputs see a user edit.
`isVisible`, `isChecked`, `isEnabled`, `isDisabled`, and `isEditable` are
immediate snapshots and return `false` when nothing matches. Use `waitFor` when
absence should be retried.

`getByText` matches an element's text, not an arbitrary text-node fragment or
its accessible name. Visible decorative descendants count even when marked
`aria-hidden`: an empty-state element containing `✓` and `No done
tasks right now.` does not exactly equal `No done tasks right now.`. Read the
failure snapshot or inspect the element before choosing a deliberate substring
assertion or a separately identifiable message element. A missed text assertion
alone does not mean the preceding action failed.

Accessible names are computed from the live DOM. Descendant text such as a
numeric badge is part of a button's name, so a `Done` button with a `3` badge
may be named `"Done 3"`. Discover the names first, then use the exact string or
a deliberate regular expression such as `/^Done\b/`. When a named role locator
misses, `CdpError` lists the available names for that role, plus any matching
names found under other roles. Use the rendered role rather than guessing from
the text.

Automation failures carry `CdpError.errorData` with `code`, `operation`,
`failureKind`, and `recovery`. An exhausted auto-wait is
`cdp_locator_state_mismatch` and includes the locator, requested state, and
timeout. A failed `click({ expect })` is `cdp_interaction_outcome_not_observed`
and includes both the dispatched and expected locators. For a crashed,
detached, or closed target, inspect panel diagnostics; the session's next
awaited operation binds the current generation. Repeat only safe reads, never
the interrupted action.

Failed locator state waits, ambiguous targets, and exhausted pointer
actionability also carry `errorData.evidence`. It is one read-only observation
collected after the failure, with no separate transport deadline; successful
operations do not collect it. `status: "captured"` includes capture time, page
URL, match count, up to eight matches with their text/name, visibility, enabled
and checked states (`checked: null` means not checkable), and a bounded
rendered-text snapshot of the locator's containing scope. If the scope is
missing or the locator is unscoped, the snapshot covers the page. Every bounded
field and match list reports its truncation. Evidence from a session includes
its panel/attempt/runtime/build identity. That identity is not proof the session
is still current; compare it with the panel's current observation when
diagnosing a stale generation.

The eval result shows this expected-versus-observed packet in model-facing text
as well as in tool details. A truncated text preview is marked as such; the full
packet stays in `details.error.errorData`. `status: "unavailable"` records why
observation failed and keeps the original error. Evidence is observed after the
failure; it does not claim the DOM was unchanged during the wait or the
collection. A failed interaction postcondition carries evidence for the expected
locator and keeps its completed action receipt in the journal. Read the actual
state before changing an assertion: after deleting the last active task,
`"0 tasks left"` is a correct result even if the assertion wrongly expected
`"1 task left"`. Evidence collection never retries input, picks another
locator, or relaxes the assertion.

Controls repeated per collection item need item-specific accessible names.
Repeated `"Mark task as completed"` buttons are an accessibility defect: fix the
app to expose names such as `"Complete Write release notes"` before testing the
interaction. Do not guess the item with `.first()`, `.last()`, or `.nth()`. If an
external page cannot be fixed, call `all()` and `inspect()` first; each
inspection includes nearest-ancestor context, so you can pick an ordinal from
rendered evidence.

`locator()` accepts CSS plus the standard `text=` selector form. `text=` is not
passed to `querySelectorAll`: a quoted JSON string means exact text and an
unquoted value means substring text, both compiled to the same descriptor
`getByText` uses. Prefer the explicit `getBy*` form in new code; the selector
form helps when translating existing Playwright code.

Page-level methods (navigation methods and `setContent` work only on browser
panels):

```ts
await page.goto("https://example.com"); // waits for load
await page.reload();
await page.goBack();
await page.goForward();
await page.setContent("<h1>Fixture</h1>"); // replace the document in place
await page.title();
page.url(); // string, synchronous like Playwright
await page.content(); // full HTML
// No default deadline. An explicit evaluation timeout is enforced by Chromium.
await page.evaluate(() => document.title);
await page.evaluate(() => new Promise(() => {}), undefined, { timeout: 5_000 });
const bytes = await page.screenshot({ fullPage: true });
await page.waitForSelector(".ready");
await page.waitForLoadState("domcontentloaded"); // or "load"
await page.waitForFunction(() => document.readyState === "complete");
const events = page.consoleEvents(); // live console capture after connect
await page.close(); // disconnect automation only; the panel remains open

// CSS locator forms
await page.locator("button.submit").click();
await page.locator('input[name="email"]').fill("user@example.com");
```

Actions and waits have no default deadline. Pass `timeout` only when the caller
has a real requirement. `setDefaultTimeout(ms)` sets one for later readiness
waits; zero disables it. Target destruction, crashes, and transport loss reject
pending waits. Function checks run as individual observations, not a renderer
polling loop. Navigation completes only on lifecycle evidence, never because
time passed. `networkidle` is unsupported; wait for the application's actual
readiness condition instead.

`page.screenshot()` returns a `Uint8Array` and has no filesystem `path` option.
When you have a panel handle, prefer the one-call host capture and return its
result from eval, alone or nested with verification data. Eval attaches each
distinct image as native image content, keeps compact receipts in the returned
structure, and does not count image bytes against the JSON preview budget. The
capture is read-only:

```ts
return await handle.cdp.screenshot({ format: "png" });
```

Or combine visual evidence with checks in the same result:

```ts
return { screenshot: await handle.cdp.screenshot(), checks };
```

For a standalone CDP page with no panel handle, write the screenshot bytes to a
context-local temp file and pass the returned file reference to `read`. Creating
the temp file is a write, so do not restrict the eval cell to
`authority.effects: "read-only"`:

```ts
const bytes = await page.screenshot({ fullPage: true });
const path = await fs.mktemp("panel-capture");
await fs.writeFile(path, bytes);
return { screenshot: `file:${path}`, byteLength: bytes.length };
```

`read({ target: screenshot, kind: "file" })` sniffs the format of extensionless
runtime files and returns image content to the model. Do not decode PNG/JPEG
bytes as text or import a package just to view the image. For content-addressed
storage rather than immediate viewing, use `blobstore.putBytes(bytes)`.
Unsupported screenshot options are rejected, not ignored.

Evaluation callbacks run in the browser. Functions passed to `page.evaluate`,
`page.waitForFunction`, `locator.evaluate`, and `locator.evaluateAll` must be
self-contained apart from their explicit argument, as in
`page.evaluate((sel) => document.querySelector(sel)?.textContent, ".title")`.
A promise that never settles fails with `cdp_evaluation_timeout` only when you
pass an evaluation `timeout`. Use locator actions, not `element.click()`,
`form.submit()`, or `form.requestSubmit()` inside `evaluate()`: those skip
actionability checks, real input, and postconditions. Exceptions keep the
browser's exception description and stack; locator failures also include the
Playwright-style locator string. A bare `Uncaught` without the underlying
exception is a platform defect; report it rather than guessing. Dialog handlers
run in the calling runtime and may use its variables; they are not browser
evaluation callbacks.

## Browser files, network, frames, and popups

Upload files, including through hidden file inputs, with byte payloads:

```ts
await page.locator("input[type=file]").setInputFiles({
  name: "notes.md",
  mimeType: "text/markdown",
  buffer: new Uint8Array([35, 32, 65]),
});
await page.locator("input[type=file]").setInputFiles([]); // clear
```

Observe requests and responses without intercepting application traffic:

```ts
page.on("requestfailed", (request) =>
  console.log(request.url(), request.failure()),
);
const responsePending = page.waitForResponse(
  (response) => response.url().endsWith("/export") && response.ok(),
);
await page.getByRole("button", { name: "Export" }).click();
const response = await responsePending;
const exported = await response.json(); // body retrieval waits for native completion
```

`page.requests()` keeps recent request diagnostics. Responses expose status,
headers, body/text/json, redirects, and native loading failures. When checking a
migration or export, capture the source export or structured responses; visible
card titles alone do not show that descriptions, comments, checklists,
attachments, or history came across.

Frame locators use each frame's own execution context and input coordinates,
including nested and cross-origin frames:

```ts
await page
  .frameLocator("iframe")
  .frameLocator("iframe.details")
  .getByRole("button", { name: "Save" })
  .click();
const frame = page.locator("iframe").nth(1).contentFrame();
```

Register activity waits before the triggering action. Hosted panel handles
expose approved downloads and popup panel references, never arbitrary host
paths:

```ts
const pendingDownload = page.waitForDownload();
await page.getByRole("link", { name: "Download" }).click();
const download = await pendingDownload;
await download.finished();
const bytes = await download.body(); // use readChunk(offset, length) for large files

const pendingPopup = page.waitForPopup();
await page.getByRole("button", { name: "Open" }).click();
const popup = await pendingPopup;
const popupSession = await panelTree.get(popup.panelId).cdp.session();
const popupPage = popupSession.page;
```

Downloads and popups use the existing browser permissions. Permission denial,
provider loss, cancellation, and native failures settle waiting callers; no
elapsed-time deadline decides the outcome. Popups are persistent panels, so
archive temporary ones when finished. Raw unhosted CDP connections do not get
the host's download or popup lifecycle.

## Not supported

Full request interception (`route`) is not part of this surface. Raw
`CdpConnection.send(method, params)` and `.on(event, listener)` remain available
for native protocol operations. Child sessions use `.session(id)`, which scopes
their commands, events, dialogs, and failures to that native session.

## Protocol-level work

For raw CDP, connect to the panel's CDP endpoint and drive the protocol
directly:

```ts
import { CdpConnection } from "@workspace/cdp-client";

const endpoint = await handle.cdp.getCdpEndpoint(); // { wsEndpoint, token }
const c = await CdpConnection.connect(endpoint.wsEndpoint, endpoint.token);

await c.send("Page.navigate", { url: "https://example.com" });
c.on("Page.loadEventFired", () => console.log("loaded"));
```

`c.send(method, params)` issues CDP commands and `c.on(event, cb)` subscribes to
CDP events. Use this for anything the page surface does not cover, such as
network interception.

## Performance profiling

Profile a single reload or interaction on the page you are automating:

```ts
const report = await page.profile(
  async () => {
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("dialog", { name: "Settings" }).waitFor();
  },
  { label: "open settings" },
);
```

The bounded JSON report includes browser CPU/task/layout deltas, heap, page
timings and long tasks, network transfer/cache/failures, and optional precise
JavaScript coverage. Profiling ends when the callback returns, so await a UI or
network condition instead of sleeping. Use `disableCache: true` for a separate
cold HTTP-cache run, and `javascriptCoverage: true` only in a separate run for
attribution because coverage adds overhead. The System workspace's
`skills/performance/SKILL.md` covers the full workflow across layers.

## Console diagnostics

Use the console history for post-mortem panel debugging. Live CDP console
events start only after a client connects and cannot recover earlier errors.
The host captures panel console messages from `webContents` as soon as the
target is registered:

```ts
const history = await handle.cdp.consoleHistory({
  limit: 200,
  errorLimit: 100,
});
console.log(history.errors);
console.log(history.dropped); // overflow is explicit
```

`history.entries` is the recent general log buffer. `history.errors` is a
separate error-only buffer, so errors survive noisy logging. Entries include
`timestamp`, `level`, `message`, `line`, `sourceId`, and `url`. For a single
debugging call, use `await handle.diagnose()`; it returns the attempt, phase,
and failure, the host-captured console and lifecycle history, and, when ready,
the document with its provenance. The captured history also records renderer
lifecycle failures such as `render-process-gone`, failed main-frame loads, and
unresponsive-renderer events.

Use the server log for failures outside the renderer, such as panel broker
errors, build/reload scheduling, workerd supervision, reconnects, and
startup/shutdown. Query `services.serverLog.query(...)` from eval or open
`about/server-logs` to follow it live; see `../server-logs/SKILL.md`.

Prefer a generation-fenced session for automation:

```ts
const session = await handle.cdp.session();
try {
  const page = session.page;
  console.log(page.url(), await page.title());
  await page.locator("button.submit").click();
  await page.locator(".status").innerText();
  await page.waitForSelector(".ready");
} finally {
  await session.close();
}
```

`page.url()` is synchronous, as in Playwright. Do not `await` it or attach
`.then()` / `.catch()`. Use `await page.evaluate(() => location.href)` only when
the URL must be read inside the page after client-side routing.

`handle.reload()` reloads a workspace panel's renderer. It does not rebuild
code or unload the panel's runtime lease. Raw `page.reload()` works only on
browser panels. `handle.reload()` waits for readiness and returns the resulting
observation. Reloading the panel that is running the
eval can cancel that eval once the command is sent; run such a reload from a
stable or root context when possible.

Tree relationships do not bypass approval. To drive a parent or sibling, get
that panel's handle and use its `handle.cdp`:

```ts
import { panelTree } from "@workspace/runtime";

const parent = panelTree.self().parent();
if (parent) {
  const parentSession = await parent.cdp.session();
  await parentSession.page.title();
  await parentSession.close();
}

const sibling = panelTree.get("sibling-panel-id");
await sibling.navigate("https://example.com/status");
```

Readiness-bearing operations return a live, booted target. For a panel you
discovered, call `observe()` and require `phase === "ready"` before custom RPC,
CDP, or `_agent` inspection. If it is `pending` and the task allows showing it,
call `focus()` under read-write authority. Use `diagnose()` when it has failed
or stalled.

## Examples

Scrape after the content you need has rendered:

```ts
const browser = await openPanel("https://news.ycombinator.com");
const session = await browser.cdp.session();
try {
  const page = session.page;
  await page.locator(".titleline > a").first().waitFor();
  const stories = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".titleline > a"), (el) => ({
      title: el.textContent,
      href: el.getAttribute("href"),
    })),
  );
  return stories.slice(0, 5);
} finally {
  await session.close();
}
```

Log in, then keep using the same page:

```ts
const page = (await browser.cdp.session()).page;
await page.getByLabel("Email").fill("user@example.com");
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in" }).click({
  expect: { locator: page.locator(".dashboard"), state: "visible" },
});
```

Imported browser cookies apply to browser panels opened afterwards. Import
them from panel code with `browserData.startSensitiveImport(...)` and
`browserData.observeSensitiveImport(operationId, { afterVersion })`; the host
reads and stores cookie, password, and form-fill plaintext and returns only
aggregate counts. `browserData` is not available in server-side eval.

## Tips

- Get one handle and reuse its session. `openPanel`, `panelTree`, and
  `getPanelHandle` work from server-side eval, panels, workers, and DOs.
- Keep the stable page across lifecycle changes; check `session.receipt`, and
  re-register listeners and locators after a `replaced` receipt.
- Prefer auto-waiting locators. Use `page.evaluate()` for computations that
  need DOM APIs, not to trigger interactions.
- In SPAs, wait for application state: after `page.goto(url)`, use a locator or
  `page.waitForFunction(...)` that only matches once the app has loaded.
- Actions already wait for their own target, so wait only for a separate
  prerequisite or postcondition, and never on wall-clock time.

## Methods

| Method                                             | Description                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `handle.cdp.session()`                             | Bind and return the panel's stable generation-fenced session                |
| `handle.cdp.getCdpEndpoint()`                      | Get `{ wsEndpoint, token }` for raw `CdpConnection.connect`                 |
| `handle.cdp.consoleHistory({ limit, errorLimit })` | Read host-captured console history and the separate error buffer            |
| `handle.cdp.screenshot({ format, quality })`       | Capture through the active host; base64 data, MIME type, dimensions         |
| `handle.diagnose()`                                | Read the current observation, console/lifecycle history, and ready document |
| `handle.click(selector)`                           | Click through the panel's session (`handle.cdp.click`)                      |
| `handle.cdp.stop()`                                | Stop loading                                                                |
| `handle.archive()`                                 | Archive the panel and its subtree                                           |

Opening panels, CDP access, and structural operations prompt on first use for
each requesting entity and target panel/root. Privileged shell/about targets
show a high-danger prompt. The remembered grant does not survive navigation of
the requester. Panels currently held by mobile or other non-CDP hosts reject CDP
access rather than being taken over.

Use `openExternal(url)` when the user needs their normal browser profile,
password manager, passkeys, or device/browser SSO. `openExternal` requires
approval.
