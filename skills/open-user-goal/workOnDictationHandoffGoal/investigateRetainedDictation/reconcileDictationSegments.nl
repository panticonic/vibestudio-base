---
description: Resolve the retained dictation source and current editable draft against the actual observed native frontiers.
args:
  goal: string
  thread: DictationThread
  observations: DictationSnapshot[]
returns: DictationSelection
---
1. Use the latest actual observed frontier in observations as current. Use that current frontier for the latest draft record with thread.draftId. Keep its exact revision. Earlier observations help explain changes but cannot override current receipts.
2. Call resolveDictationProvenance with the exact thread and current frontier. For a held result carry its exact capture and acknowledgment IDs and reason. Use null transcript and no selected segments.
3. For a usable result call assembleAcknowledgedText with the exact thread, frontier, capture and acknowledgment. Return its selection and the exact capture, draft revision and acknowledgment message ID.
