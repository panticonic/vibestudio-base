---
description: Identify the single incident that matches the user's scope from current observed workspace records.
args:
  goal: string
  incidents: IncidentCard[]
returns: string | null
---
Read the requested surface, version or time, user action, and expected symptom from the goal. Compare each to the live cards. Historical or finished cases can explain a symptom but are not the active incident unless the user requests that historical record. If more than one card matches without a distinguishing fact or no locally scoped case fits, return null. Otherwise return exactly the selected card ID.
