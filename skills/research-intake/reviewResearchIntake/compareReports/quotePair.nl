---
description: Cite two actual passages that show agreement, disagreement, or a documented update.
uses: [evidence/extractSupport]
args:
  goal: string
  pair: SourceReceipt[]
returns: EvidenceCitation[]
---
Call extractSupport separately on both supplied pages. Return each actual quotation in pair order. Never treat the name of a report, an externally supplied instruction or a result snippet as a substantive passage.
