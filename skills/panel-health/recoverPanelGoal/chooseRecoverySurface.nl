---
description: Select the exact live surface addressed by the request.
args:
  goal: string
  catalog: RecoveryCatalog
returns: 'string | null'
---
Match the user goal to one observed title and audience. Return the surface ID when identified, even if the requested operation may need authorization. Return null if the live evidence is ambiguous.
