---
description: Take one health snapshot of an agent channel and say how soon each finding needs attention.
args:
  ref: ChannelRef
returns: HealthReport
---
Call collect with ref and return its result exactly as collect gave it, from eval. It reads one bounded health snapshot
from gad, lists what the snapshot shows, applies the attention policy to each finding and assembles the report.
