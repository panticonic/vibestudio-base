---
description: Review selected source transfer without changing the destination workspace.
args:
  request: TemplateTransferInput
returns: TemplateDecision
---
If there is a transfer receipt, retain its exact operation ID. Return continue-merge when coordinates remain or the import is uncommitted, else locally-copied. For a new request, call checkSelection then checkDestination. Return the first unmet requirement or ready-to-copy, with basis null. An existing repository uses external-delta compare while a fresh import creates a new local repository. Neither is a publication receipt.
