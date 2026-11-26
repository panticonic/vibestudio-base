---
description: Resolve the user's retained provider request from native consent, original delivery and current output evidence.
args:
  goal: string
returns: ProviderResult
---
Use the owned conversation index and chooseProviderConversation to identify the request described by the goal. Gather the relevant retained history through observeProviderHistory, passing the actual card and workspace.readProviderConversation as its reader. Keep unavailable or incomplete evidence explicit; queue disappearance is not an approval.

Use reviewRetainedApproval for the native queue visibility judgment, chooseRetainedResult for the exact request's host decision and original result, and reviewRetainedDelivery for the delivered evidence. Read the selected output through workspace.readProviderOutput only when supported by that scope and consent. A refusal or unavailable readback is evidence, not permission to invent output. Refresh the conversation and reconsider these judgments if its native frontier changed; preserve the observations used for the comparison.

Let decideProviderHandoff explain the current finding with the exact native request, messages and output. Use shouldStageProviderHandoff to distinguish a requested private artifact from a read-only question. Stage through workspace.stageProviderHandoff only for the requested, permitted, substantiated handoff; retain actual refusal and receipt. Return applicationResult with the actual plan and optional handoff. An old grant never authorizes a new provider operation, external session or send.
