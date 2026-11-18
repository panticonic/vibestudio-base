# Shared complete-runtime verification execution

## Inventory before editing

`packages/harness/src/tools/verify.ts:173-425` owns declared-suite resolution, exact-context compilation, result projection and `unit-verification-receipt.v1`. It already accepts a complete-runtime execution callback. Native suites use the existing native receiver and explicitly compare artifact/execution identity; they remain there.

`packages/agentic-do/src/agent-worker-base.ts:475-590` currently implements the only sandbox callback inline: create the real Testbench coordinator, record running identity, launch an actual browser child or disposable workerd entity with the immutable execution artifact, execute `tests.run`, parse its result, record done/error and clean up both worker and coordinator. The extraction moves this one implementation into `@workspace/harness/unit-verification`; agent verification delegates to it and a test-owned worker can supply the same existing ports. No second test executor or synthetic test result is introduced.

`packages/test-runtime/src/index.ts:runTests` and `testRunnerRpcMethods` define the actual sandbox runner. `packages/service-schemas/src/build.ts:testExecutionResultV1Schema` supplies the authoritative wire result shape. `packages/runtime/src/shared/panelRuntime.ts` and the caller's typed RPC preserve the existing context, receiver authority and abort signal. No model-serving engine protocol is involved.

## Exact mechanism and findings

The exported `executeSandboxTest(ports, artifact, testName?, signal?)` receives the existing `rpc`, `openPanel`, one exact `contextId` and the caller's `operationPrefix`. It retains the existing Testbench records, production browser/workerd runtime, artifact references, execution limits and finally cleanup. Native execution and model policy stay outside this helper. No authority is selected, widened or impersonated.

The old inline callback parsed a valid result envelope without comparing its artifact key, execution digest or runtime to the request. The shared helper rejects these mismatches before recording success, matching the existing native identity check. All valid result behavior is preserved. The old nested finally blocks could replace the execution error with a retirement/archive error. The helper retains the original failure and all cleanup failures (one original error or an AggregateError), still attempts both cleanup operations, and never sends an already-aborted execution signal to cleanup.

## Reuse

An owning worker imports `executeSandboxTest` from `@workspace/harness/unit-verification` and passes its original authority-scoped RPC and panel API. The existing `createVerifyTool` remains the single producer of build/test receipts. A caller must reuse that verification contract instead of fabricating a receipt or invoking a native test process for a sandbox suite. The Natlang unit-repair policy is a separate typed `.nl` workflow; this file changes only exact outside-world execution plumbing.

The public non-tool `verifyUnit(ports, input, signal?)` returns the original typed `VerifyToolDetails` JSON evidence and receipt. It invokes the same `executeUnitVerification` operation as `createVerifyTool`; only the tool wrapper publishes UI progress. Rendering and receipt production are kept together in that original canonical operation, so the native entry does not fake `api.output`, `api.details` or a tool execution context.
