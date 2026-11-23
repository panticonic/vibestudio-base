---
description: Select the smallest joint set of exact installed methods needed to resolve the user's local intent.
args:
  goal: string
  notice: IntentNotice
  capabilities: IntentDescription[]
returns: IntentPlan
---
Match each requested fact, not a guessed action. Use the exact described method ID for every action. A workspace edit question uses the notice context id and the working status read. A saved local note uses its precise notice path. An installed guide uses the notice skill name. Active worker identity uses the exact notice key. Do not open, change, launch, connect, or run a service. Keep the action order aligned with the requested facts and retain only when the user authorized a private note.
