---
description: Find the unique current saved invocation matching the user’s purpose before inspecting its actual gateway.
args:
  goal: string
returns: CliDocketEvidence | null
---
Call cliRouteDocket.list and identify the exact current docket. An archived similar invocation cannot authorize the request. For a unique current match call cliRouteDocket.read on its id and revision. Check both returned identity fields and return the real evidence unchanged. If no unique match exists, return null.
