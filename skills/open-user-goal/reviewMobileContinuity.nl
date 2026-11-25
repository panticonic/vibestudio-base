---
description: Resolve the user's continuity question from current, owned mobile evidence.
args:
  goal: string
returns: MobileContinuityFinding
---
Work out what the user needs to know about the current handset and its retained presentation. Resolve the relevant owned profile and obtain the current build, cache, transport and route evidence needed to answer that question. Use the scoped observation and explanation functions as a hierarchy; reconsider incomplete or conflicting evidence rather than treating an archived record as current.

Return the requested finding, including any limitation that affects the user's intended use. A route held by another client is not available merely because this handset retains a cached overview. Respect the user's restriction against taking it back. A local replay establishes only the observed code and retained-state facts, never physical installation, rendering or hardware readiness. This is an inspection, not authority to change device state or acquire a lease.
