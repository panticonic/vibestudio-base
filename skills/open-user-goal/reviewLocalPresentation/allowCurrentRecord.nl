---
description: Determine whether the requested preview may use this freshly read revision of the same local source.
args:
  goal: string
  previous: LocalPresentationSource
  current: LocalPresentationSource
returns: boolean
---
Determine whether the requested preview may use this freshly read revision of the same local source. Hold when the user pinned the prior revision, current data is no longer the requested owner or period, or previewAllowed is false. Return true only if the user permits latest owned authorized data; do not substitute another source.
