---
description: Find where the workspace's documentation answers a question, as exact quotes with their paths.
args:
  question: string
returns: Located
---
Call locateDoc with question and return its result unchanged, from eval, so the quotes stay exact. locateDoc searches
the Markdown documents and the capability catalog, asks whether each candidate section answers question, and quotes
the ones that do. To turn a failed call into its cause and next step, call recoverFromFailure with the failed call.
