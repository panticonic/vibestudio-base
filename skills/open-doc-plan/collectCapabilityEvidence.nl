---
description: Search the current role-filtered catalog and open the most relevant concrete methods.
args:
  goal: string
  requests: RequestedDocs
returns: CapabilityEvidence
---
Call docPlanCatalog.search on the selected queries and preserve their exact hits. Call chooseCapabilityEntries with the goal and hits. Call docPlanCatalog.describe for each selected exact ID. If requests.inventory is true, read docPlanCatalog.overview. Return the actual successful descriptions and inventory, or null for unrequested inventory. Do not convert a miss in search results into a claim of absence.
