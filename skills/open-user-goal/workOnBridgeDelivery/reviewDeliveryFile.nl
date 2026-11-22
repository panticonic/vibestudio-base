---
description: Use the installed semantic VCS delivery reviewer for a specific authorized release file.
args:
  goal: string
  scope: DeliveryScope
  operationId: string
  path: string
returns: LocalFileReview
---
Call semantic.reviewVcsDelivery with its operationId, unchanged goal, scope repository and supplied path. Preserve the actual report and file versions.
