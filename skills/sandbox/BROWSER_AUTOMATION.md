# CDP Panel Automation from Eval

The complete CDP reference is
[workspace-dev/BROWSER.md](../workspace-dev/BROWSER.md): the stable panel
session and its generation rules, locators, actions and receipts, dialogs,
files, frames, popups, diagnostics, and profiling. This page adds only what is
specific to eval and inline UI.

For web browsing or website automation, open or reuse a dedicated browser
panel. Existing workspace panels, including chat panels, are applications:
inspect them when debugging that app, but do not use them as throwaway pages.

## Where this runs

`openPanel`, `panelTree`, and `getPanelHandle` are portable
`@workspace/runtime` APIs, and the CDP client is workerd-native, so eval can
open a browser panel and drive it directly. `browserData` is not available in
server-side eval.

Acquiring a session gives raw page control, so it needs a read-write eval.
A read-only cell can still use `handle.cdp.screenshot()`,
`handle.cdp.consoleHistory()`, and `handle.diagnose()`.

## A disposable page in one cell

Open a browser panel at `about:blank` and give it the document with
`page.setContent(html)`. `await using` archives the panel when the cell exits,
including on failure. Returning `handle.cdp.screenshot()` attaches the image
to the result as native image content, so the model sees it.

```ts
import { openPanel } from "@workspace/runtime";

await using handle = await openPanel("about:blank");
const session = await handle.cdp.session();
try {
  const page = session.page;
  await page.setContent(`<main><p id="status">Ready</p><button>Run check</button></main>
<script>document.querySelector("button").onclick = () => {
  document.querySelector("#status").textContent = "Succeeded: click handled";
};</script>`);
  await page.getByRole("button", { name: "Run check", exact: true }).click();
  const status = await page.locator("#status").textContent();
  if (status !== "Succeeded: click handled")
    throw new Error(`Unexpected rendered status: ${status}`);
  return { status, screenshot: await handle.cdp.screenshot({ format: "png" }) };
} finally {
  await session.close();
}
```

After an input, read the state the page actually changes. A wait for a
predicate that only becomes true on success stays pending if the handler never
ran; a direct DOM read returns the actual value, so you can report the
mismatch.

## Across cells

Keep the handle and its session in `scope`. Both are kept by identity, so they
survive the warm kernel and cold recovery (see
[EVAL.md](EVAL.md#serialization)), and the session page binds the panel's
current generation at its next awaited operation.

```ts
scope.browser ??= await openPanel("https://example.com");
scope.session = await scope.browser.cdp.session();
await scope.session.page.getByRole("button", { name: "Sign in" }).click();
```

Locators, `page.on()` listeners, and `consoleEvents()` belong to one
generation and to the live kernel; recreate them from `scope.session.page`.
When the workflow is done, close the session and archive the owned panel in
the cell that finishes it:

```ts
await scope.session.close();
await scope.browser.archive();
delete scope.session;
delete scope.browser;
```

In a headless session `getParent()` returns null; create your own root before
opening children, as shown in [EVAL.md](EVAL.md#eval-perspective).

## Inline UI: Browser Control Panel

A component holds its handle in a ref; the stable session page follows
navigation by itself.

> **Defensive coding:** This example reads `props.startUrl`. Default it, as in `const startUrl = props?.startUrl ?? "https://example.com"`, in case the caller omits the prop.

```
inline_ui({
  code: `
import { useState, useRef } from "react";
import { Button, Flex, Text, TextField, Badge } from "@radix-ui/themes";
import { openPanel } from "@workspace/runtime";

export default function BrowserController({ props, chat }) {
  const [url, setUrl] = useState(props?.startUrl ?? "https://example.com");
  const [status, setStatus] = useState("disconnected");
  const [pageTitle, setPageTitle] = useState("");
  const pageRef = useRef(null);

  const handleConnect = async () => {
    setStatus("connecting...");
    const handle = await openPanel(url);
    pageRef.current = (await handle.cdp.session()).page;
    setStatus("connected");
    setPageTitle(await pageRef.current.title());
  };

  const handleNavigate = async () => {
    if (!pageRef.current) return;
    await pageRef.current.goto(url);
    setPageTitle(await pageRef.current.title());
  };

  const handleScrape = async () => {
    if (!pageRef.current) return;
    const text = await pageRef.current.evaluate(() => document.body.innerText);
    await chat.send("Page text (" + text.length + " chars):\\n" + text.slice(0, 500));
  };

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" align="center">
        <TextField.Root value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1 }} />
        {status === "disconnected"
          ? <Button size="1" onClick={handleConnect}>Open</Button>
          : <Button size="1" onClick={handleNavigate}>Go</Button>}
        <Button size="1" variant="soft" onClick={handleScrape} disabled={!pageRef.current}>Scrape</Button>
      </Flex>
      <Flex gap="2" align="center">
        <Badge color={status === "connected" ? "green" : "gray"}>{status}</Badge>
        {pageTitle && <Text size="1" color="gray">{pageTitle}</Text>}
      </Flex>
    </Flex>
  );
}`,
  props: { startUrl: "https://example.com" }
})
```

A component loses its refs on remount. Persist the panel id (a string) in
props, state, or the channel, and get the handle back with
`getPanelHandle(id)`.
