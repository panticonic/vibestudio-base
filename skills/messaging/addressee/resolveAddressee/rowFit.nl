---
description: Decide whether one addressee is the recipient the user named.
readout: decision
args:
  utterance: string
  row: AddresseeRow
returns: Fit
---
utterance is what the user asked the agent to do; somewhere in it the user names whom to tell. row is one person
or agent the agent could message. Decide whether row is the recipient the user named, by the first rule that fits:
1. yes: utterance names this row: its ref (such as "@helper"), its name in note (a first name counts when it is
   the first word of the name in note), or its role (the supervisor, the agent that spawned you, a subagent run,
   everyone in the conversation).
2. maybe: utterance points at a group or a description this row could belong to (a role like "the reviewer", a
   chat surface like "on my phone"), or at only part of the name in note that other names could share.
3. no: nothing in utterance points at this row.
Only the recipient counts. Words about what to say, or other people named as the subject of the message, do not make a
row the recipient.
