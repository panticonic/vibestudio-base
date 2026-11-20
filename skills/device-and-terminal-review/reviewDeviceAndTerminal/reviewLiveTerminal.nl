---
description: Review the caller's retained live evidence for an assigned terminal operation.
uses: [reviewDeviceAndTerminal/reviewTerminal]
args:
  request: {kind: "terminal-receipt", goal: string, operationId: string}
returns: DeviceTerminalReview
---
Call readTerminalEvidence with the assigned operation ID. Pass that exact observation to reviewTerminal and return its findings. Check target ownership before interpreting process status. Do not run a command or repeat an operation.
