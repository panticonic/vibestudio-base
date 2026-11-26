---
description: Identify which plausible historical record answers the user’s question.
args:
  goal: string
  initialWindow: ReviewWindow
  initialView: ReconcileView
  snapshots: ArchiveSnapshot[]
returns: ArchiveSnapshot | null
---
Select the record that represents the user's requested earlier decision. Use the recorded revision, setting, and value. For a request about the prior local working record, a matching original observed head can establish its native revision. A later changed working head is not proof that the earlier record is absent, and a parameter named initial is not authority to rewrite or invent historical identity. Match an incoming plan or baseline record to the actual observed source or baseline revision, and use only established native revision relationships for other records. If the observed facts cannot disambiguate the records, return null.
