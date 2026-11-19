---
description: Trace the live service to its exact workspace source before judging ownership.
args:
  operationId: string
returns: ArchitectureProvider
---
Call resolveProvider with operationId then readDeclaration with the returned route receipt. Call matchDeclaration with the route and declaration. Return both observations and whether they match.
