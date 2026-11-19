---
description: Evaluate exact matched pairing and workspace readiness without requesting another invite.
args:
  input: PhoneSetupEvidence
returns: DeviceTerminalReview
---
1. Readiness without pairing is blocked / pairing-unobserved with readiness ID. A pairing for another selected provider, platform or selected attached ID is blocked / pairing-target-mismatch with target then pairing ID. A null requested provider or attached ID means no explicit constraint.
2. A matching expired pairing is attention / pairing-expired with pairing ID; a matching failed pairing is attention / pairing-failed with pairing ID.
3. A paired phone without readiness is waiting / workspace-readiness-unobserved with pairing ID. A readiness lookup for another pairedDeviceId is blocked / workspace-target-mismatch citing pairing then readiness.
4. For a matching readback, opening is waiting / workspace-opening; failed is attention / workspace-preparation-failed; ready is ready / phone-workspace-ready. Cite matching readiness ID. Only ready supports unplugging.
