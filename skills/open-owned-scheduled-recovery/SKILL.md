---
name: open-owned-scheduled-recovery
description: Recover owned scheduled automation changes using current native schedules and retained local decisions.
---

Use the Natlang callable `recoverScheduledAutomation` when an automation change must be reconciled with an interrupted local conversation. It reads owned schedules and their original local decisions, verifies prerequisites, makes an authorized bounded change, and independently reads back a requested local handoff.
