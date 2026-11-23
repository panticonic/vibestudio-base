---
description: Write only the plain-text findings the user separately requested about this source record.
args:
  goal: string
  record: LocalPresentationSource
returns: string[]
---
Write only the plain-text findings the user separately requested about this source record. Ground each finding in these exact sections, preserving units, comparisons, time order and uncertainty. Return one note per requested prose finding, or an empty array when the user requested only a visual preview. Do not infer missing facts or copy unrelated records.
