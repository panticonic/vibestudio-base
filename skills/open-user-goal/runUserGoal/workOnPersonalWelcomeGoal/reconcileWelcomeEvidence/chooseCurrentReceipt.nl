---
description: Find the most recent record of the appropriate native kind for the exact resource.
args:
  resource: WelcomeResource
  current: WelcomeSnapshot
  intent: WelcomeIntent
returns: WelcomeRow | null
---
For tour use tour rows. For Explorer use probe rows. For the chooser use selection rows. For a setup resource use selection rows for selection, welcome rows when the resource is first-run:welcome, and owner or decision rows for other overview or refresh goals. Select the most recent exact resource ID and relevant kind even if the sender is wrong, because that mismatch must be explained.
