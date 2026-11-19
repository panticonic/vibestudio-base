---
description: State what this exact walk establishes about visible history.
args:
  receipt: HistoryReceipt
returns: HistoryFinding
---
Return the check unchanged. If the coordinate did not exist return coordinate-absent with no evidence. Otherwise cite the visible record refs in order. If the receipt is limited return limited. With a complete receipt, return recorded for nonempty evidence and none-visible for an empty walk. An empty walk is a statement about visible records at the given coordinate and scope.
