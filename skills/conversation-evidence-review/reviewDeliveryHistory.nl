---
description: Audit an accepted conversation receipt against durable replay and the assigned consumer.
args:
  request: DeliveryHistoryRequest
returns: DeliveryHistoryReport
---
Call deliveryHistory.inspect with request.operationId. Call checkOrigin with the observation. If origin is matched, call compareConsumer with the retained row and consumer rows. Otherwise set consumer to unreviewed. Return the exact observation, both verdicts, and verified only when origin and consumer are both matched. Do not retry a send while auditing an earlier receipt.
