# Open verified program execution

The `runtime-live-program-receipts` cases measure `natlang.describe` and
`natlang.load` against one preselected program and retain the outcome of its
typed invocation. The open lane uses the same compiler and loader and mounts
`runtime-evidence-review` for actual compiler and execution decisions. The
open goal supplies no program, argument, or desired verdict separately.

- `workOnProgramRunGoal` composes discovery, inspection, an authorized trial,
  independent readback, and a signed workspace receipt. The companion
  lambdas select the work, choose the scope of a trial, decide whether the
  goal permits a second attempt, and decide whether the verified result
  warrants a signed receipt.
- `discoverRuns` reads owned program records and available sample descriptions.
  `inspectProgram` compiles the selected workspace source and resolves its
  actual exported callable. The service returns the revision and compiler
  observation. A read-only or rejected candidate gives no execution grant.
- `runSample` accepts only an observed, current source revision and a sample
  authorized by the workspace caller. The exact named TypeScript export runs
  through the Workerd Natlang loader in the owned context. The managed bank
  uses bounded project-owned functions with no network, credentials, models,
  or filesystem authority. A returned value, actual error, or an actual
  program interruption is retained before any succeeding run.
- `readOutputReceipt` reads the exact retained attempt, checks the output
  against the workspace reference, and compares its revision with current
  source. The existing natural-language reviewer interprets the resulting
  compiler or execution evidence. The flow may recover on a fresh approved
  revision or alternative sample after reading the previous attempt.
- `signVerifiedRun` stages an authorized output attestation with the exact
  input, program revision and checked output under a signature from the owned
  context. The independent judge reads it from the filesystem and checks the
  signature and receipt binding. Signed artifacts carry no model-controlled
  claims. Signing uses only this disposable context's key. Private case
  expectations and the signer stay outside model context.
