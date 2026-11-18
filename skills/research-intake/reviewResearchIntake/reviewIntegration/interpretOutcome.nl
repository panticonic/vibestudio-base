---
description: Interpret what actually happened at the host API boundary.
args:
  observation: IntegrationReceipt
returns: ResearchDisposition
---
1. Denied or cancelled ends this attempt, so use ended. Needs-approval uses approval-required. Missing uses configure-provider. No-attempt or matched uses request-unconfirmed.
2. For provider-error, transport-error or response, require requestBoundToEndpoint first. If it is false, use request-unconfirmed. Otherwise use provider-error for provider failure and retry-transport for a transport failure.
3. For a bound response, HTTP outside 200–299 uses provider-error. Use schema-mismatch for an explicit response mismatch and request-unconfirmed for absent response status or unavailable response shape. Use ready only for a 2xx response with a matching shape.
