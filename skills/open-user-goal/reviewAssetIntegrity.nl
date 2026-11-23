---
description: Verify exact retained asset identity and contents, and copy approved bytes into private scratch only when requested.
args:
  goal: string
returns: AssetIntegrityOutcome
budget: { maxTurns: 25 }
---
1. Call discoverVersions and readVersion for each result. Establish the retained archive, signed release and current working evidence for the bundle. Do not use the oldest or newest path as permission.
2. For each asset on the signed manifest, call compareAsset using the complete signed and working readbacks. Keep the comparison order and exact IDs. If several discrepancies apply, report each. Preserve the archive as historical evidence. Different historical bytes do not invalidate a newer approved edition; verify each edition against its own manifest and independent readback.
3. Ask planRecovery with the user's goal, all three readbacks and the actual findings. If it asks for no copy, return its decision and reason with the latest observed working revision and a null receipt.
4. Send an approved copy plan to stageRecovery with the exact signed and working revision tokens. If staged, return that exact receipt. If held, give the actual reason with a null receipt.
5. On changed, discover the versions again and read the new working one. Recompute the actual findings. If the user pinned the earlier working evidence, return a held outcome and state that the working revision changed. If they permit the current revision, plan again from the refreshed evidence and make at most one new copy attempt. Report the newly observed revision. Never write to the source workspace.
