---
description: Preserve the stated reason or the boundary where an origin stops.
args:
  receipt: AttributionReceipt
returns: {supportedIntent:string|null; boundary:string|null}
---
Return only statedIntentRef as the supported intent and preserve visibleBoundary as given. An actor name, source revision, edit action or import path does not by itself establish intent. If no stated intent is recorded use null.
