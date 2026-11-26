---
description: Produce actual scoped bridge-delivery evidence for the outer coordinator.
args:
  goal: string
  previous: BridgeInquiry | null
returns: BridgeInquiry
uses: [workOnBridgeDelivery/project/discover, workOnBridgeDelivery/chooseBridgeScope, workOnBridgeDelivery/project/inspect, workOnBridgeDelivery/project/operation, workOnBridgeDelivery/inspectCurrentBridge, workOnBridgeDelivery/reviewDeliveryFile, workOnBridgeDelivery/assessRetainedBranch]
---
Identify the actual owned delivery scope and decide which branch, live bridge or file evidence the user question needs. Acquire current native operation bindings only for those observations. Use the mounted git-bridge and semantic VCS review hierarchies; independent file judgments may overlap when no explicit order or real dependency prevents it.

Distinguish a retained observation from a live upstream or semantic-file read. Return actual evidence and branch assessment, with uninspected or unavailable components null. Do not commit, push, integrate or retain a note from this inquiry.

When continuing an investigation, preserve actual earlier observations from previous where their identity still matches this owned request. A fresh current read does not replace a historical opening or renew a grant. Use null for an initial inquiry, and pass actual prior inquiry values when refining rather than synthesizing them.
