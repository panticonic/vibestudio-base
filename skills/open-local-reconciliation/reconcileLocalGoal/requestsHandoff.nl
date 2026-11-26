---
description: Interpret only whether this user requests a retained handoff artifact.
args:
  goal: string
returns: boolean
---
Determine whether the user asks for evidence retained for a reviewer or next crew, rather than only an answer about the final state. Interpret the request only; do not perform, verify or repair project work. This private intent-only leaf has no project helpers or native service ports. Permission to retain something does not itself request retention.
