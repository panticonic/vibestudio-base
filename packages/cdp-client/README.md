# @workspace/cdp-client

A **workerd-native** Chrome DevTools Protocol client with a
**Playwright-style `Page`/`Locator` API**, implemented entirely over raw CDP
(`Runtime`/`DOM`/`Input`/`Page` domains) and a single `WebSocket`. No Node
dependencies and no vendored browser bundle, so it runs in panels, workers, and
Durable Objects / server-side `eval` alike.

This is the **single browser-automation surface** in the workspace. There is no
"full Playwright" package — do not install any `playwright*` dependency.

The page API also provides bounded, agent-readable performance profiling. Wrap
one exact interaction or reload with `page.profile(action, options)` to collect
Chromium runtime, page, network, and optional precise JavaScript-coverage
evidence without exporting an unbounded trace. Await the workflow's actual
completion condition inside `action`; coverage and cold-cache modes are opt-in.

## Getting a session

From any panel handle (panels, workers, server-side eval — anywhere you hold a
handle):

```ts
const session = await handle.cdp.session();
try {
  await session.page.getByRole("button", { name: "Sign in" }).click();
} finally {
  await session.close();
}
```

The handle owns the panel target; the session owns one stable generation-fenced
automation connection. Use the session's stable page throughout a related
operation sequence and close it in `finally`. Closing the session does not
archive the panel; `handle.archive()` archives an owned panel subtree.

Raw `page.goto()`, `page.reload()`, `page.goBack()`, and `page.goForward()` are
browser-panel operations. Workspace pages reject them so navigation cannot
bypass panel readiness and generation tracking. Use `handle.navigate()`,
`handle.reload()`, or `handle.rebuild()`. The stable session page rebinds at its
next awaited operation, and `session.receipt` reports the resulting generation.

A deferred panel observation has phase `pending` and no CDP generation. Run
`await handle.focus()` to materialize it before acquiring a session. In
server-side eval, that lifecycle call requires `authority.effects:
"read-write"`; it is intentionally rejected in read-only mode.

## Playwright compatibility notes

Locator `click`, `dblclick`, `press`, `check`, `uncheck`, and `setChecked` return
native interaction receipts and accept an optional semantic `expect` condition.
Checkbox actions observe the requested checked/unchecked state automatically,
dispatch at most one click, and never replay while waiting for controlled state.
An already-correct control returns `delivery: "not-needed"` without requiring
pointer actionability. Failed postconditions retain the delivery receipt before
throwing. Locator waits include `checked` and `unchecked` states.

The page and locator surface intentionally follows Playwright where possible.
That includes synchronous accessors:

```ts
const url = page.url(); // string, not Promise<string>
const events = page.consoleEvents(); // CdpConsoleEvent[], not a Promise
page.clearConsoleEvents(); // void
```

Do not `await page.url()` or attach `.then()` / `.catch()` to it. Use
`await page.evaluate(() => location.href)` only when you need the page itself to
compute the current URL after client-side routing.

For protocol-level work (any CDP domain, raw commands + events):

```ts
import { CdpConnection } from "@workspace/cdp-client";

const { wsEndpoint, token } = await handle.cdp.getCdpEndpoint();
const cdp = await CdpConnection.connect(wsEndpoint, token);
await cdp.send("Network.enable");
const off = cdp.on("Network.responseReceived", (p) => console.log(p));
// ... later: off(); cdp.close();
```

## Locators

Resilient, Playwright-style locators (resolved fresh on every use):

```ts
page.getByRole("button", { name: "Save", exact: true });
page.getByRole("button", { name: /delete .* item/i });
page.getByText("Welcome");
page.getByLabel("Email");
page.getByPlaceholder("Search…");
page.getByTestId("submit");
page.getByAltText("Logo");
page.getByTitle("Close");
page.locator("css .selector"); // CSS escape hatch
```

Chain and narrow:

```ts
page
  .getByRole("listitem")
  .filter({ hasText: /active/i })
  .first();
page.locator("table").getByRole("row").nth(2).getByRole("cell").last();
const rows = await page.getByRole("row").all(); // Locator[]
```

## Actions (auto-waiting)

Every action **auto-waits** for the element to be present, visible, stable, and
enabled before acting — no manual `waitForSelector` before a click:

```ts
await loc.click(); // also: dblclick, hover
await loc.fill("text"); // also: type, clear, press("Enter")
await loc.check(); // also: uncheck, setChecked(true)
await loc.selectOption("value");
await loc.selectOption({ label: "Visible label" });
await loc.selectOption({ index: 1 });
await loc.focus(); // also: blur, scrollIntoViewIfNeeded

await page.keyboard.press("Control+A"); // Ctrl/Cmd aliases are accepted
await page.keyboard.type("replacement");
await page.keyboard.insertText("pasted as one input operation");
await page.setViewportSize({ width: 390, height: 844 });
page.viewportSize(); // synchronous current CSS viewport
```

Text matchers accept strings or `RegExp`. `getByRole` string names identify the
normalized, case-sensitive whole accessible name by default (unlike Playwright's
fuzzy default). Use a regex or explicit `{ exact: false }` for partial names.
Other text helpers use case-insensitive substring matching by default;
`{ exact: true }` selects a case-sensitive whole-string match. Matcher source/flags are serialized explicitly
instead of degrading to `{}` at the CDP boundary. Form actions use native DOM
property setters plus input/change events, including for controlled React inputs.

## Reads & state

Failed state waits, ambiguous locators, and exhausted actionability include
`CdpError.errorData.evidence`: one bounded, read-only post-failure observation
without a separate transport deadline. It records match count, actual matching
control states, capture time/URL, and containing-scope rendered text (page text
when the scope is absent). Truncation is explicit. `status: "unavailable"`
preserves collection failure without replacing the primary error. A supplied
`inspectionIdentity` is copied once at connection creation and records the
owning panel session, not the current lifecycle generation. Successful calls
do not collect this packet; failure recovery never replays input or picks a
replacement target. Failed interaction postconditions preserve both evidence
for their expected locator and the dispatched-action receipt.

```ts
await loc.textContent(); // innerText, inputValue, getAttribute("href")
await loc.count(); // allTextContents, allInnerTexts
await loc.evaluate((element) => element.innerHTML);
await loc.evaluateAll((elements) =>
  elements.map((element) => element.textContent),
);
await loc.isVisible(); // isChecked, isEnabled, isDisabled, isEditable
await loc.boundingBox();
await loc.inspect();
// { tagName, id, className, text, role, accessibleName, visible, attributes,
//   boundingBox }
```

The `isVisible`, `isChecked`, `isEnabled`, `isDisabled`, and `isEditable`
methods are immediate snapshots and return `false` when there is no current
match. Use `waitFor` when absence should be retried. Other single-element reads
and actions auto-wait.

Before acting on a newly rendered UI, inspect its live accessibility names:

```ts
const buttons = await page.getByRole("button").all();
const semantics = await Promise.all(buttons.map((button) => button.inspect()));
```

Descendant text contributes to the accessible name (`Done` plus a `3` badge is
typically `"Done 3"`). A failed named-role locator includes the available names
in its `CdpError`.

## Waiting

For workspace panels, acquire a session from the panel handle after its normal
build/boot readiness lifecycle. That lifecycle propagates failures and target
loss; polling a selector is not a replacement for panel readiness. For a UI
transition, observe its semantic postcondition with `expect` or `waitFor`. A
wrong accessible name remains an error: inspect the returned evidence instead
of replaying input or extending the retry loop.

```ts
await loc.waitFor({ state: "visible" }); // attached | detached | visible | hidden | checked | unchecked
await page.waitForLoadState("domcontentloaded");
await page.waitForFunction(() => document.readyState === "complete");
await page.waitForSelector(".ready");
```

An exhausted locator wait is reported as `cdp_locator_state_mismatch`, with the
locator, requested state, observation count, and any explicit timeout in `errorData`. It is not collapsed into a
generic `cdp_evaluation_failed` error.

## Screenshots

```ts
const bytes = await page.screenshot({ type: "png", fullPage: true });
```

The result is `Uint8Array`; there is no filesystem `path` option in a
workerd-native client. Store bytes explicitly with `@workspace/runtime`
`blobstore.putBytes`. Unknown options are rejected with the supported option
list instead of being silently ignored.

## Timeouts

Readiness checks make at most **100 observations** (the initial observation plus
99 retries). Exhaustion throws a structured error with the observation count
and, for locators, the rendered UI evidence. Input is dispatched at most once;
only readiness observations are retried. There is no default elapsed-time
deadline. An explicit deadline can shorten the observation budget:

```ts
page.setDefaultTimeout(10_000);
await loc.click({ timeout: 2_000 });
```

## Errors

Failures throw a **`CdpError`** whose message names the target locator
(Playwright-style) and the reason, with `.locator` and `.cause` for handling:

```ts
import { CdpError } from "@workspace/cdp-client";

try {
  await page.getByTestId("missing").click();
} catch (e) {
  if (e instanceof CdpError) {
    e.message; // 'not actionable (not found) after 30000ms: getByTestId("missing")'
    e.locator; // 'getByTestId("missing")'
  }
}
```

`locator.toString()` returns the same description, handy for logging.

Exceptions from `page.evaluate`, locator callbacks, and in-page operations
preserve the browser exception description and stack. The message begins with
`Browser evaluation failed:` and includes the actual error name/message instead
of collapsing every exception to CDP's generic `Uncaught` label. Locator
operations wrap that detail in `CdpError` without discarding it.

Use locator actions for interaction. Calling `element.click()`, `form.submit()`,
or `form.requestSubmit()` through `evaluate()` bypasses locator actionability,
real CDP input dispatch, and semantic postcondition reporting. A failed
`click({ expect })` includes the dispatched locator, expected locator/state, and
timeout in `errorData`, so the caller can distinguish delivery from an
unobserved application outcome.

Functions passed to `page.evaluate`, `waitForFunction`, `locator.evaluate`, or
`locator.evaluateAll` are serialized into the page realm. They must be
self-contained apart from the explicit argument. Eval's cooperative deadline
instrumentation remains realm-safe when such a callback is serialized.

## Console capture

```ts
page.consoleEvents(); // [{ type, text, args }] captured since connect
page.clearConsoleEvents();
```

## Browser files, network, frames, and popups

Use portable byte payloads for uploads, including hidden file inputs:

```ts
await page.locator("input[type=file]").setInputFiles({
  name: "notes.md",
  mimeType: "text/markdown",
  buffer: new Uint8Array([35, 32, 65]),
});
await page.locator("input[type=file]").setInputFiles([]); // clear
```

Observe native requests and responses without intercepting application traffic:

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

`page.requests()` retains recent request diagnostics. Responses expose status,
headers, body/text/json, redirects and native loading failures. Capture source
exports or structured responses when available; visible card titles alone do not
establish that descriptions, comments, checklists, attachments or history migrated.

Frame locators use each frame's native execution context and input coordinates,
including nested frames and cross-origin frames:

```ts
await page
  .frameLocator("iframe")
  .frameLocator("iframe.details")
  .getByRole("button", { name: "Save" })
  .click();
const frame = page.locator("iframe").nth(1).contentFrame();
```

Register activity waits before the triggering action. Hosted panel handles expose
approved downloads and durable popup panel references, never arbitrary host paths:

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

Downloads and popups use existing browser permissions. Permission denial, provider
loss, cancellation, and native failures settle waiting callers. No implicit
elapsed-time deadline supplies a successful or failed outcome. Popups are durable
panels; archive temporary panels when finished. Raw unhosted CDP connections do
not provide the host's download or popup lifecycle.

## Not supported

Full request interception (`route`) is not part of this surface. Raw
`CdpConnection.send(method, params)` and `.on(event, listener)` remain available
for native protocol operations. Child sessions use `.session(id)` and keep their
commands, events, dialogs and failures scoped to that native session.

## Build conditions

`package.json` exports resolve per target — all to the same implementation:

| condition          | entry            |
| ------------------ | ---------------- |
| `worker`/`workerd` | `src/worker.ts`  |
| `vibestudio-panel` | `src/browser.ts` |
| `default`          | `src/index.ts`   |

Types are published from `index.d.ts` (kept in sync with `src/worker.ts`).

### Transport completion

CDP acquisition and command dispatch have no elapsed-time safety deadline.
Commands settle on their correlated response, explicit connection closure,
renderer crash/detachment, or a transport/protocol failure. Invalid frames retire
that connection and reject its pending commands. Connection acquisition accepts
an optional `signal`; abort cancels and joins the upgrade or socket opening.
An established browser has its own lifetime and must be closed by its owner.
Actions, locator waits and function/load predicates share the 100-observation
readiness budget. Navigation waits on its lifecycle events, without an
observation limit. A caller can add a time deadline with `timeout` or
`setDefaultTimeout`; zero disables only that deadline, not the observation limit. Function and load checks use one-shot observations,
yielding outside the renderer so they cannot strand browser input behind a
long-lived evaluation. Target loss rejects pending observations and navigation
waits. Hosted eval cancellation is carried through the active invocation
owner, including operations on a retained page; it closes the automation
connection and rejects its pending observations with the cancellation cause.
Navigation never treats elapsed time as successful readiness. `page.evaluate` forwards only an explicitly
provided `timeout` to Chrome's native evaluation request, rather than abandoning
a dispatched evaluation with a local timer.

### Native integration verification

From the host checkout, explicitly run the native Chromium lifecycle check:

```sh
VIBESTUDIO_USERLAND_TEMPLATE=base VIBESTUDIO_RUN_CDP_SDK_NATIVE=1 \
node --import tsx node_modules/vitest/vitest.mjs run \
  --config vitest.userland.config.ts tests/workspace-integration/cdp-sdk-native.test.ts
```

It owns and retires its browser, profile, connections and download staging. Its
investigation deadline cancels the SDK operation and joins cleanup; this is test
containment and does not impose a production browser deadline.
