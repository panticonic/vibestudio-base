---
description: Verify an assigned delivery through durable channel history and the actual chat panel.
uses: [reviewDeliveryHistory]
args:
  request: ChatDeliveryRequest
returns: ChatDeliveryReport
---
1. Call reviewDeliveryHistory with the assigned goal and operationId. Keep the full delivery report.
2. If the delivery report is unverified, return it with panel null and verdict history-unverified. Do not inspect the panel.
3. Call inspectPanel with the assigned panelId and call checkPanel with the request, delivery observation's channelId, and panel observation. If it fails, return the panel observation with verdict panel-mismatch.
4. Call checkMessage with the single verified retained message and the panel's message rows. Return its verdict and both observations.
