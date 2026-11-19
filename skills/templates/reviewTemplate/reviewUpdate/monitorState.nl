---
description: Preserve the existing durable update monitor and the meaning of paused, retired, or missing state.
args:
  state: "active" | "paused" | "retired" | "missing"
returns: "use-installed-watch" | "resume-installed-watch" | "watch-retired" | "check-provisioning"
---
For active return use-installed-watch. For paused return resume-installed-watch as the next control choice, preserving the existing revision. For retired return watch-retired. For missing return check-provisioning. Do not suggest starting a second timer or assert that a watch ran.
