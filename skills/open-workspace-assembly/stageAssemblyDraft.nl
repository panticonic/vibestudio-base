---
description: Write an authorized owned assembly manifest and plan as a local scratch draft.
args:
  plan: AssemblyPlan
returns: AssemblyHandoff | null
---
Call assemblyDraft.stage with the exact plan. Retain the actual receipt or refusal. This drafts locally and does not modify the managed packages.
