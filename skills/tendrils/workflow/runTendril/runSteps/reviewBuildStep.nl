---
description: Verify a new build, the host's rollback, or an explicitly requested return through history.
args:
  previous: TendrilPage
  step: TendrilStep
returns: TendrilFinding
---
For update, call tendrilBuild.update with step.candidate and pass its outcome and page to verifyBuildStep. For restore, call tendrilBuild.back and pass its page and outcome proven to verifyBuildStep. Include the previous page and step in either call, and return its finding.
