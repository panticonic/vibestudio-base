---
description: Identify the public factual question needed to decide a requested workspace revision.
args:
  goal: string
  documents: WorkspaceRevision[]
returns: string
---
Use the actually read document text to resolve the subjects of the goal (including references such as "the tutorial’s examples"). Do not require literal identifiers when the document establishes an unambiguous named category; do not invent specific examples. Return the factual research question that public sources can settle for this goal. Preserve its subjects, necessary distinctions and authority requirements. Leave workspace inspection, editing, publication and delivery instructions with the parent revision function. Ask the question; do not answer it or assume its conclusion.
