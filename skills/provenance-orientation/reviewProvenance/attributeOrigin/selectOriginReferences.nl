---
description: Record copy, merge, edit, and import provenance in evidence priority order.
args:
  receipt: AttributionReceipt
returns: string[]
---
For a copy return its direct sourceRef before actionRef. For a merge return decisionRef, any sourceRef, and actionRef. For external-import return sourceRef and actionRef. For managed edit return actionRef. Omit absent refs and retain each issued ref literally. Do not substitute an unobserved source even when there is a source revision.
