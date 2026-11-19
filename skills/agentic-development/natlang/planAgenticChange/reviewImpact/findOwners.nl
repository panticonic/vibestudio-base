---
description: Find the installed source owner and consumers of the proposed agentic behavior change.
args:
  goal: string
  sources: AgenticSourceObservation
returns: "{ owner: AgenticUnit | null; consumers: AgenticUnit[]; blockers: string[] }"
---
1. Decide which concern changes. Chat composition and capabilities live in panels/chat, reusable React conversation UI in packages/agentic-chat, the default agent adapter in workers/agent-worker, native Session execution in packages/agentic-do, durable channel state in workers/pubsub-channel and canonical schemas and reducers in packages/agentic-protocol. Client-side coordination belongs in packages/agentic-core and reusable channel client transport in packages/pubsub.
2. Use the installed guide observations to confirm the owner and the impacted consumers. For shared events and stored values, consider producers, schemas, reducers, renderers and diagnostics. Put behavior at its owner and keep clients on the shared contract.
3. Return a blocker if the requested change is ambiguous or the owner or a required consumer lacks an installed guide. Do not substitute another package.
