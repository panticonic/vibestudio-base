---
description: Reconcile exact retained News articles and authority and stage an authorized private evidence handoff.
budget: { maxTurns: 36 }
args:
  goal: string
returns: NewsEvidenceReport
---
1. Discover the owned reader and topics. Call chooseNewsCoverage with the unchanged goal and index. Read the exact native conversation twice. Check current reader authority with checkNewsReaderBoundary.
2. Separately call reviewNewsOwnerCadence with the current snapshot. When reader authority verifies, read the selected views in order through workspace.readNewsEvidenceView and call reviewNewsReaderWindow on each exact input. Call groundNewsEdition for the exact topic. Otherwise keep readers and sources empty and briefing null.
3. Call decideNewsEvidenceHandoff with all exact evidence. Form the report with plan, readers, schedule, briefing, sources and null handoff. If stage is supported, call workspace.stageNewsEvidenceNote with that report and include its unchanged receipt. Otherwise return the unchanged no-handoff report.
