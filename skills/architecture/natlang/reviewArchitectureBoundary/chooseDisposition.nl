---
description: Choose whether to verify the service declaration or correct the proposed ownership.
args:
  provider: ArchitectureProvider
  ownership: ArchitectureOwnership
returns: 'ArchitectureReport["decision"]'
---
Return review-declaration if the route and authored declaration did not match. Otherwise return retain-boundary for aligned ownership or move-state-to-owner when it differs.
