---
description: Choose the responsible state boundary while preserving the role of the resolved service.
args:
  concern: ArchitectureConcern
  provider: ArchitectureProvider
returns: ArchitectureOwner
---
Workspace history is semantic-vcs. An RPC receiver for workspace operations delegates to it. Conversation history is durable-channel, even when an app projects a new transcript. The durable-provider owns mission records across scheduler and panel processes. Use the assigned concern and actual provider role. Do not assign durable state to a build projection, a transport endpoint, or presentation state.
