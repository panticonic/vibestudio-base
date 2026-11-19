---
description: Check the candidate declares exactly the authority its caller expects.
args:
  contract: AuthoringContract
  candidate: string[]
  baseline: string[]
returns: AuthoringFinding[]
---
Use declaredServices as the expected set when supplied. If absent, use baseline only if preserveBaseline is true. Otherwise return no findings. Report one missing-service for each missing declaration and unexpected-service for each extra declaration, named in subject. Use "missing" or "declared" in observed. Unneeded authority can be removed; review any required addition with the caller.
