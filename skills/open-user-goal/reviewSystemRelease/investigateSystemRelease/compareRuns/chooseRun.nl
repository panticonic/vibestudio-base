---
description: Decide which exact run, if any, can support this release review.
args:
  assignment: ReleaseAssignment
  runs: RetainedRunPair
returns: RunChoice
---
1. A different context yields hold-context. A present nominated run with another or unrecorded build key or effective version yields hold-build. A cancelled nominated run yields hold-cancelled. Never substitute for these cases or a currently recorded terminal failure.
2. Use a saved completed or errored nominated record on the exact release build. An errored record can still support diagnosis of retained cases.
3. Only if the nominated record is missing or running and the assignment explicitly permits an earlier attempt, consider the earlier record. It must be in this context with the exact build key and effective version, have a saved completed terminal record, and include all required cases without any marked uninstalled. If so return its id.
4. A running nominated run without such a substitute yields hold-active. A missing nominated run without one yields hold-missing-run. Return the selected id and a null blocker, or a null id and the applicable blocker.
