---
description: Reconcile the authorized owned project using current observations, actual feedback and retained source evidence.
args:
  goal: string
  prior: ArchiveSnapshot | null
returns: IntegrationResult
budget: { maxTurns: 30 }
---
Investigate the actual project view with observeProject and interpret the requested intentions with the full prior snapshot when relevant. Planning receives the actual current observation, including its own window/head and operation feedback; an earlier window is historical evidence and must not be used as current authority. Use planResolution when useful to decide supported edits, offered resolutions or a reasoned hold. A user-requested read-only investigation or closed/pending window does not authorize mutation.

Choose the needed native operations through writeResolution at their exact current head. Consume the actual result: accepted records a committed operation, changed records no submitted effect at that stale head, and held records no mutation under that window. Re-observe/replan as actual feedback requires, preserving peer amendments and the user's original qualifiers. Combining approved values can use an exact source edit followed by the then-current offered resolution; there is no requirement for an option literally named composed. An empty merge can record genuine native convergence when the actual remaining coordinate set is empty.

Before reporting, interpret the latest current file state and actual operationFeedback. Do not retain an earlier held/integrated assessment after later accepted work changed that state. Report integrated only with actual native settlement and requested intentions established, and return its actual current head and explanation. Keep project configuration changes separate from requested handoff evidence; do not add explanatory bookkeeping fields to live source unless the user actually requested that source change. No fixed retry count, helper route, or private expected answer is prescribed.
