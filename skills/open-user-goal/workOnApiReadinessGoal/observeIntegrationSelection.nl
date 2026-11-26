---
description: Acquire the actual authorizing selection evidence needed for this integration question.
args:
  goal: string
  index: IntegrationIndex
  readSelection: '(channelId: string) => Promise<SelectionFrontier | null>'
returns: IntegrationHistory | null
---
Use the supplied scoped reader for the inventory's owned channel. Await its actual native result. Determine the selection history and current evidence needed to answer the user's question, including a refresh when a change or current authority matters. A stable actual observation can establish both earlier and current views; additional reads are allowed but do not add authority. Preserve native message identities, revision, attribution and chronology. Do not choose a profile or open a credential review here. Return the actual earlier/current evidence, or null when required evidence is unavailable. Never manufacture a selection from a copied title or an expected result.
