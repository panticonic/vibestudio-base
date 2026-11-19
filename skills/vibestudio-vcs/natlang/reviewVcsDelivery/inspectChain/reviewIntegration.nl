---
description: Determine whether the local chain can target the current protected main.
args:
  relation: VcsDeliverySnapshot["relation"]
  integrations: VcsDeliveryIntegration[]
returns: VcsDeliveryMainReview
---
A current integration with remaining coordinates or unresolved conflicts has state decisions-open. Explain what decisions need review. A stale projection needs a fresh comparison before it can establish any decision's status. If behind or diverged, or if a projection is stale, use integrate and explain the required inspection or integration. Otherwise an integration with no remaining coordinates and concluded false needs conclusion-pending. Name its exact source and explain that the commit must explicitly conclude it. Otherwise use current. An ahead branch can target main, but publication is not implied.
