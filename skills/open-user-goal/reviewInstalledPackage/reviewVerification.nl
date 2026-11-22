---
description: Inspect the native suite plan for the actual latest package state.
args:
  observed: PackageObservation
returns: 'SuiteReviewReport | null'
---
If the actual observation supplies a suiteRequest, call nativeSuite.reviewTestSuite with that request unchanged and return its real report. In this assignment only inspect the declared runner. Otherwise return null.
