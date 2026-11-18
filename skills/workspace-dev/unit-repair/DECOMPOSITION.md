# Repair an assigned worker with real compilation and workerd tests

The task starts from the workspace-development skill's compiler-driven repair guidance and the project lifecycle,
build verification, and unit-diagnostic system tests. Two label-normalizer fixtures fail in distinct ways. One
contains a type mismatch and the other references a missing source helper. Both preserve the original suite and
the caller's requested behavior.

| Responsibility | Implementation |
| --- | --- |
| Read current build evidence, dispatch repair stages, apply and verify | `repairUnit.nl` owns the source revision and invokes the typed stages in order. |
| Locate the failure and explain its cause | `diagnose.nl` reads the assigned source and calls `explainCause.nl` with precise compiler and test evidence. |
| Propose a complete repair | `proposeRepair.nl` consumes the diagnosis and exact current text and returns edits. |
| Assess candidate behavior | `verifyRepair.nl` interprets the actual candidate's build and workerd suite results. |
| Enforce context, revision and edit scope | `@workspace/natlang-services` binds the existing VCS and build APIs. The root owns edits and test execution. |
| Execute the selected manifest suite | `@workspace/harness/unit-verification` uses the same Testbench, immutable artifact identity and disposable workerd worker as the agent verification tool. |
| Verify the live result for admission | The system-testing oracle independently rebuilds and runs the same tests, comparing original manifest/test hashes and the exact candidate receipt. |

The root uses another repair cycle only when new evidence or an untried hypothesis supports it. Every new execution
has its own context, semantic revision and call tree. The oracle and its protected source hashes stay outside the
model's editable service. Publication is outside the workflow.
