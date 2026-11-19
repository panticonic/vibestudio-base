---
description: Explain the specific transfer implication of the upstream state and its evidence.
args:
  direction: GitBridgeDirection
  upstream: GitBridgeUpstream
  freshness: GitBridgeFreshness
returns: string
---
Explain the observed upstream state for direction. Name the remote and branch only if supplied. Cite relationship and ahead or behind counts only from observation. A fresh observation with branchExists false means the configured branch is missing. An absent observation leaves branch presence unknown. For integration-required name the pending semantic candidate when it is present. Auth failures call for checking the configured binding. A transfer in progress calls for waiting for its receipt.
