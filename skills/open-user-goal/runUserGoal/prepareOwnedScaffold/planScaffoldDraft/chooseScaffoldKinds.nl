---
description: Select the type of each canonical starter from the user's requested behavior.
args:
  goal: string
returns: ScaffoldKind[]
---
Use react or svelte for local panels; add the site variant only when the goal asks for a portable website entry. Use stateless for a request handler with no retained agent state and agentic for a durable agent with its own native suite. Use package for reusable callable code, skill for reusable agent instructions, content for files with no executable startup. Use web-client, terminal-client or native-client when the goal expressly needs that client host. For a bundle keep the user's stated order. Return only exact variant literals.
