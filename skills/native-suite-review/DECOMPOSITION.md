# Declared test-suite review

The program handles one caller-assigned target and suite in the current
VibeStudio context. It can review the declaration or execute the assigned
verification and interpret the result.

| Procedure | Implementation |
| --- | --- |
| Resolve the suite declaration | The TypeScript binding asks the build service for its typed plan at the current context. The suite name is opaque with respect to runtime selection. |
| Select runtime and authority | `reviewPlan/interpretRuntime` describes the manifest's runtime. `reviewPlan/chooseRunDisposition` combines caller mode with the observed runtime. |
| Run the approved assignment | The binding uses the same `verifyUnit` entry point as the verify tool. It ties the target, suite and filters to the caller's assignment. The installed runtime owns native approval and all execution. |
| Confirm exact result identity | The binding compares the live plan and returned receipt with the assigned plan. |
| Interpret outcome and recovery | `reviewResult/interpretOutcome` distinguishes assertions, compilation, no matches and incomplete runs. `reviewResult/planFollowUp` proposes a follow-up from the status and diagnostics. |

A runtime or build failure leaves that runtime as the recorded route. A new
attempt starts from a newly observed declaration.
