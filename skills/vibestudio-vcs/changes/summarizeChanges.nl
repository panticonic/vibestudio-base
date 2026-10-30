---
description: Summarize a vcs compare result for review, or propose the commit message for it.
args:
  compare: Compare
returns: ChangeSummary
---
Call summarize with compare and return its result unchanged, from eval, so the lists of files stay exact.
summarize reduces compare to the changes the source side makes, describes each repository in a sentence, and
reports whether conflicts or composed coordinates need reading first.
