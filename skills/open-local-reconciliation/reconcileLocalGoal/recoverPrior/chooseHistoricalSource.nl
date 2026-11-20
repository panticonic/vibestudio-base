---
description: Identify which plausible historical record answers the user’s question.
args:
  goal: string
  initialWindow: ReviewWindow
  initialView: ReconcileView
  snapshots: ArchiveSnapshot[]
returns: ArchiveSnapshot | null
---
Select the record that represents the user's requested earlier decision. Use the recorded revision, setting, and value. For a request about the prior local working record, the initial window head is the native pre-integration reference. Match the approved incoming plan or prior baseline to the observed source or baseline revision, respectively. If the observed facts cannot disambiguate the records, return null.
