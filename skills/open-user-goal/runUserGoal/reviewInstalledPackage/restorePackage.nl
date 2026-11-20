---
description: Attempt one scoped declaration restoration against the observed local state.
args:
  observed: PackageObservation
returns: PackageRestore
---
Pass the exact operation ID, working revision and working digest to installedPackageChange.restore. Return its actual response. A changed head is a hold and must not be retried as though already approved.
