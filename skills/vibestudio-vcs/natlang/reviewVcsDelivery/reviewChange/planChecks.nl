---
description: Choose concrete verification for the exact delivery candidate.
args:
  path: string
  interpretation: {effect: string, risks: string[]}
returns: string[]
---
Return up to three ordered checks. A check should name an observable behavior or a file-level postcondition and explain how to verify it in the candidate context. For missing evidence start with the relevant exact read; for a deletion check callers or references; for a behavioral edit exercise the affected case. If the file matches main, give no file-level checks.
