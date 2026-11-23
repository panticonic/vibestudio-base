---
description: Inspect the actual workspace documents needed to interpret a research-backed revision goal.
args:
  goal: string
returns: WorkspaceRevision[]
---
List the available documents using listDocuments. Read plausible target and supporting documents with readDocuments. Resolve references in the user goal from their actual text, distinguishing current targets from archived material. If a read reveals missing context, read further relevant documents. Return the original observations with their versions and exact text; do not edit, invent domain names, or answer the public factual question here.
