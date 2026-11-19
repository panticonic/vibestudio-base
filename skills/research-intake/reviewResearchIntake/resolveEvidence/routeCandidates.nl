---
description: Identify eligible candidates and distinguish discovery rows from fetched evidence.
args:
  request: ResearchIntakeRequest
returns: SourceReceipt[]
---
For supplied URLs select fetches whose requestedUrl matches one of them exactly. Otherwise prefer plainly relevant receipts to the question, primary pages first. Keep the original receipt values; redirects change the final citation URL without changing which requested page matches. Search output is discovery only and is not a source receipt.
