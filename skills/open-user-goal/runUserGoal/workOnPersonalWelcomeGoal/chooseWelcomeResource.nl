---
description: Select the exact Personal first-run resource and owner for the user's goal.
args:
  goal: string
  index: WelcomeIndex
returns: WelcomeChoice
---
Find the appropriate resource from the installed index using its title, exact purpose, sender and scope. Distinguish tour illustrations from actual owner selections and local Explorer diagnostics. When two entries equally match and the request does not resolve the scope, choose ambiguous-resource with null ID. Return no-resource and null ID for a missing current surface. Otherwise return selected with the exact ID. Do not invent a route or resend a welcome.
