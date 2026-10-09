---
name: web-research
description: Search the web, fetch URLs into readable text, read bounded ranges, cite sources, or configure an alternative search provider.
---

# Web research

The web tools are read-only, but each operation is still authorized per
resource.

## Core workflow

1. Use `web_search` to find candidate URLs. Batch related questions in one
   `queries` array. Agents whose primary provider is OpenAI Codex search through
   their connected subscription and get answers with inline citations by
   default.
2. If a cited Codex answer fully supports the response, answer from it. Use
   `web_fetch` when you need an exact quotation, a table, an omitted detail,
   further verification, or content from a URL the user supplied.
3. After `web_fetch`, read the returned head first. If more is needed, use
   `web_read` with the returned digest and bounded offsets.
4. Cite the URLs supporting the answer.

`web_fetch` uses a cookie-free Chromium session by default. Use
`session: "browser"` only when the page needs the user's imported browser
cookies. That mode requires approval because the content may be private.

For a user-supplied URL, start with `web_fetch`. For workspace facts, use
workspace files and live docs instead. Uncited search snippets help you find
sources; do not cite them as sources in the answer.

Use each tool's exposed schema for current limits and fields.

## Large pages and PDFs

`web_fetch` stores the extracted readable content in the blobstore and returns
its digest. Read only the ranges you need. If you don't know where the content
is, run a bounded blobstore grep from eval and read around the match. Never
return the whole page through eval.

PDF fetches use the same digest/read flow when text extraction succeeds. For
scanned or layout-sensitive local PDFs, use [PDF
ingestion](../../extensions/pdf-ingest/SKILL.md).

## Browser fallback

`web_fetch` has no logged-in browser session and doesn't run client
JavaScript. When a page needs the user's browser state or client rendering:

1. Open or reuse one browser panel.
2. Get its CDP page through the panel handle.
3. Wait until the content you need has loaded, then extract only that data.
4. Store large readable text by digest.
5. Close the page connection in `finally`. Open a temporary panel with
   `await using panel = await openPanel(url)` so it is archived when the cell
   exits, unless the user asked to keep it.

Read [browser automation](../workspace-dev/BROWSER.md) for the page API.
Don't open several browser panels when plain fetches suffice. Don't bypass
paywalls or claim content the fetch or browser couldn't access.

## Targeted APIs

When a documented domain API answers more precisely than general search, call
it through `credentials.fetch()` as described in [API
integrations](../api-integrations/SKILL.md). Don't copy endpoint recipes into
this skill; provider auth and response schemas change.

## Alternative search setup

Agents whose primary provider is OpenAI Codex use subscription search with no
setup. Other model providers use built-in DuckDuckGo search, which needs no
credential. When the user asks for Tavily, Brave, or Exa, or non-Codex search
keeps failing, render the setup workflow:

```text
inline_ui({
  path: "skills/web-research/SearchProviderSetup.tsx",
  props: {}
})
```

The component handles provider choice, signup links, credential input, status,
errors, and retry. Don't ask for an API key in chat or rebuild the workflow as
separate questions.

If the user has already picked a provider, use that provider's helper from
`@workspace-skills/web-research`. Read `index.ts` for the current helper names,
supported providers, selection order, status, and revocation APIs.

## Reporting

- Distinguish publication date from event date for time-sensitive facts.
- Prefer primary sources and fetch every source you rely on.
- State when a page was inaccessible, empty, truncated, or required a logged-in
  browser.
- Keep quotations short; cite the exact URL near the supported claim.
- Treat blob digests as content references, not public citations.
