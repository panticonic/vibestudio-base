---
description: Continue an assigned live presentation one verified step at a time.
args:
  presentation: TendrilPresentation
  steps: TendrilStep[]
returns: TendrilFinding[]
---
1. Call tendrilPage.inspect for the current page. If its slot does not match presentation.slotId, return one blocked finding with that ID and no page.
2. For each step in order, call reviewBuildStep for update or restore and reviewLiveStep for read, write or invoke. Supply the previous verified page and keep the returned finding.
3. Stop at a blocked finding or a finding without a page. A confirmed rollback can serve as the next verified page. Return actual findings in order.
