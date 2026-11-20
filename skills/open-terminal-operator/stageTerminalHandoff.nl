---
description: Commit the currently observed receipts to a local scratch file when the caller authorized it.
args: {}
returns: TerminalHandoff | null
---
Call openTerminalHandoff.stage once. Return its actual verified receipt or null. Do not invent the filename or digest.
