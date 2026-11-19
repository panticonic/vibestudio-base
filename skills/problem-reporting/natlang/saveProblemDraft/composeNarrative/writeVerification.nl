---
description: Identify a focused verification step for the assigned failure.
args:
  account: Evidence
returns: LocalDraftSection
---
Write a verification section marked unverified. Preserve any stated attempt as the user's account and name the smallest check that would distinguish the expected and reported results. Quote the user's expected result exactly if supplied. If the account lacks the essential details for a useful check, return a questions section asking for those details instead. Do not state that the proposed check ran.
