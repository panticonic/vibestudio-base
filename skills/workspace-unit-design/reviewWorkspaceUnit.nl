---
description: Review an authorized workspace design or candidate from typed Vibestudio records.
args:
  request: UnitReviewRequest
returns: UnitReview
---
1. For architecture, extension, capability and agentic requests, call reviewArchitecture, reviewExtension, reviewCapability or reviewAgenticChange respectively. For extension-design-live, call reviewLiveExtensionDesign and return its report.
2. Execute each supplied item in order for composed work. Combine the reports with combineWork, preserving each component and its source evidence. A missing observation is never evidence of a passing transition.
3. Return the typed report. This is a readiness review of supplied records within their scope.
