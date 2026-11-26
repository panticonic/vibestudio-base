---
description: Produce actual scoped intent-discovery evidence for the outer coordinator.
args:
  goal: string
returns: IntentInquiry
uses: [discoverScopedIntent/workspace/readIntentNotice, discoverScopedIntent/searchRelevantIntent, discoverScopedIntent/workspace/describeIntentSelection, discoverScopedIntent/chooseIntentActions, discoverScopedIntent/workspace/inspectIntentEvidence]
---
Determine which questions in the goal need native evidence, discover or identify real installed methods and inspect their actual descriptions before relying on them. Select only useful readonly actions on the exact notice-owned scopes. Different requested facts may use independent observations; do not force a private four-method inventory or treat catalog entries as evidence of execution.

Return the actual notice, selected descriptions, chosen plan and native observations for a conclusion. Record unavailable observations as such. This inquiry acquires evidence; it does not retain a note or claim that the outer goal is complete.
