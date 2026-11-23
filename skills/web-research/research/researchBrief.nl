---
description: Investigate a question through public sources and return only facts supported by pages actually read.
args:
  question: string
  sources: string[]
  retrievedAt: number
returns: CitedBrief
budget: { maxTurns: 24 }
---
Choose how to establish the facts the question needs. A search result or a recalled URL is a lead, never evidence. Use the cookie-free public session.

When sources is nonempty, it is the caller's reading scope. Work through those sources as useful; do not broaden that scope. When sources is empty, use discoverSources to choose public source candidates. It can search, follow observed references, or propose an authority's public page from current knowledge. A search outage does not make a direct public source unavailable.

Use brief to read a bounded batch of chosen pages and obtain checked quotations and cited statements. Compare what the returned evidence establishes with the actual question. If material facts remain unresolved, use discoverSources with the URLs already attempted and actual failures to choose a different source or route. Prefer a different route after a provider-wide block; repeating an identical blocked search adds no evidence. Never solve or bypass an access challenge.

Return the supported answer when the evidence covers the question. When combining batches, use combineBriefs so exact citations and read failures remain intact. If no permitted route provides evidence, return insufficient with the actual failures. Keep retrievedAt unchanged throughout; do not fill missing facts from memory or search snippets.
