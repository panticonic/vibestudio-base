---
description: Render only the editor's justified view using the installed Base presentation skill.
args:
  goal: string
  desk: EditorDesk
  plan: EditorPacketPlan
  news: NewsEvidenceReport
returns: PresentationReport
---
Build one required presentation section with desk.id as its id, using desk.format and its stored structured facts. Include the title and exact observed article or claim evidence from the News report. Use decimal numbers only when sourced; omit guessed counts. Call installed.preparePresentation with that section and return its checked view. Preserve the exact rendered result and omit any interpretation that the current source cannot support.
