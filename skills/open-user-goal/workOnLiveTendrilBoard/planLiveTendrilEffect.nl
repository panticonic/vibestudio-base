---
description: Translate a user's board intent into authorized visible and durable Tendril effects.
args:
  goal: string
  ticket: LiveTendrilTicket
returns: 'TendrilRequest | null'
---
1. Identify the desired visible changes and any temporal dependencies in the user's goal. A layout change uses the exact authorized candidate and build from the ticket. Track the previously visible build, starting at board-v1, for any requested restoration. A failed candidate is expected to roll back rather than become the next prior build.
2. Use writes only for explicitly requested field values. Use the exposed control with its declared effect for starting review, returning to intake, acknowledging, withdrawing, or clearing a timer. Add a read only for an explicitly requested intermediate or separate observation. Each action is independently read back by the workflow.
3. Use the ticket's local platform alone and reject queuing for a different or offline device. Return goal unchanged, platforms containing that platform, allowPending false, and the ordered planned steps, or null for an unsupported request.
