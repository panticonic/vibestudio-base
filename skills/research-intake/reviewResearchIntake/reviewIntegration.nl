---
description: Translate a sanitized, scoped API observation into a supported operator action.
args:
  request: ResearchIntakeRequest
returns: ResearchFinding
---
1. If integration is absent, use request-unconfirmed with empty evidenceIds. Otherwise call assessEndpoint(integration) and, when it returns null, interpretOutcome(integration). Cite only integration.id.
2. Return that disposition using the observed phase or documented schema as the reason. Use no citations. Do not expose token values or infer credentials from inventory. A completed setup or HTTP success by itself is not evidence of an authorized, bound, schema-matching response.
