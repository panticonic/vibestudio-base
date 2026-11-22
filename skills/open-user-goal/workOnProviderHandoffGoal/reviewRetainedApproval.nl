---
description: Compare earlier and latest native queue receipts using the installed visibility review.
args:
  goal: string
  card: ConversationCard
  earlier: ConversationRead
  current: ConversationRead
returns: ApprovalReviewEvidence
---
For each view, keep the latest retained queue observation per visible source. Pass the actual receipts, the assigned approval request ID, the goal and real caller role to authority.reviewApprovalTransition. Return the exact request and actual review as result. Avoid inferring a consent decision from queue disappearance.
