---
description: Prepare and pair the assigned phone, or resume its workspace readiness check.
args:
  request: PhoneSetupRequest
returns: PhoneSetupReport
budget: { maxTurns: 22 }
---
1. Call readAssignment with request.operationId. Start the evidence with its receipt.
2. If the assignment includes a pairedDeviceId, call checkWorkspace with the assignment receipt. Append its evidence and return its status and that exact paired ID. This resume ends here.
3. Otherwise call discoverPhone. Append its evidence. If no device was selected, return its status and guidance with no pairedDeviceId.
4. Call pairPhone with the final discovery receipt and the selected deviceId. Append the returned receipt. If no pairedDeviceId was returned, report pairing-unconfirmed and ask the user to inspect the device in the setup card before another attempt.
5. For a paired device call checkWorkspace with the pairing receipt, append its evidence, and return its status and the pairedDeviceId. Only workspace-ready permits unplugging.
