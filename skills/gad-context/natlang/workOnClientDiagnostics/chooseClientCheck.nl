---
description: Choose the next owned client or durable conversation observation in a diagnostic.
args:
  goal: string
  catalog: ClientCatalog
  views: ClientView[]
  effects: ClientActionReceipt[]
  channel: 'ChannelReview | null'
returns: ClientDiagnosticStep
---
Return one ClientDiagnosticStep from the supplied catalog, views, effects and channel evidence. The coordinator executes that step, observes its result and calls this chooser again; this call is complete when it returns the next step. Select an inspection of the named current client surface when its evidence is needed. Use audience and device to disambiguate similar titles. Choose inspections for an explicitly requested comparison in the order the user needs. An apparent state on a renderer alone cannot answer whether the durable conversation has a publication, response or active roster. Use recap for the published tail and triage for a missing participant question.
Choose an act step only for the authorized named surface and exact observed control or viewport. A disabled or absent control, signed display, or foreign client must hold without an attempt. Use the coordinator’s post-action observation to decide the next step. When the owner changes a revision before an action, choose a fresh inspection when needed and use its returned authority and state on the next invocation to choose whether to retry. Return finish once the actual checks support a conclusion or require a hold.
