---
description: Choose the alert rung for a notify message by what the recipient should experience.
args:
  message: Outgoing
returns: AlertRung
readout: decision
---
Choose the alert rung for message by the first rule that fits:
1. If recipient is "channel", "supervisor", "subagent" or "other-agent", answer none.
2. If recipient is "person" and stated_preference asks not to be pinged or to be left alone, answer none.
3. If recipient is "person" and the content is something they would want to be pulled away from what they are doing for (damage or data loss happening now, an outage, an exposed secret, a deadline about to pass), answer interrupt.
4. Otherwise answer inbox: a person should find the news later without a screen being taken over.
