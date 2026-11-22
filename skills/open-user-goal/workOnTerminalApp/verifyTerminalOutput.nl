---
description: Confirm the exact finished terminal candidate passed the original native suite and is backed by an actual terminal artifact.
args:
  appId: string
  revision: string
returns: {check: TerminalRepairCheck; artifact: TerminalRepairArtifact | null}
---
Call checkFinalSource with the app ID and observed revision. If the exact clean build and complete original native suite pass, call readTerminalArtifact with that same app and revision. Return the exact results. A changed revision or an unavailable native receipt cannot carry an artifact.
