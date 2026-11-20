---
description: Locate an assigned pending request by its exact ID and owning queue.
args:
  approvalId: string | null
  surfaces: ApprovalSurfaceReview[]
  coverage: ApprovalVisibility
returns: ApprovalLocation
---
1. For a null approvalId return status unassigned and source null.
2. Search the visible surfaces in their supplied order for the exact ID. The first match yields located and its source.
3. With no match return absent if coverage is complete, or unconfirmed otherwise. Use source null.
