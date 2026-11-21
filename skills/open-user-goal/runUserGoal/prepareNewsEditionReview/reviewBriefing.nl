---
description: Verify the latest edition's retained briefing disposition with the installed News policy.
args:
  news: NewsEvidenceReport
returns: boolean
---
Require news.briefing. Give its original input to installed.reviewNews. Compare the returned status and finding identities with news.briefing.result. Return true only if they match and the briefing is ready. Missing or paused inputs cannot turn into publication claims.
