# Semantic VCS delivery review

The shared workflow reviews one assigned file across the caller's current context and protected main. It returns checks for the version the user intends to deliver.

| Procedure from the skill | Implementation |
| --- | --- |
| Read context status and retain opaque revision IDs | The caller-owned TypeScript binding reads semantic VCS status in the assigned context. |
| Read the same path in working, committed, and protected-main state | The binding resolves the repository and file at each immutable state, compares file identity, content hash and mode, and checks that the context and main did not move during inspection. It returns bounded text and preserves the exact IDs. |
| Distinguish work still local from work already committed | `inspectChain/describeLocalChain` interprets the status and working changes for the user. |
| Determine what the branch still owes protected main | `inspectChain/reviewIntegration` considers ancestry and open decisions. |
| Interpret the assigned file's effect and select focused tests | `reviewChange` calls separate source interpretation and verification lambdas. |
| Decide the immediate delivery step | `chooseDeliveryStep` combines the work-chain, integration, and file evidence. |
| Commit or publish | The reviewed version and checks go back to the caller. The assignment's service port exposes semantic reads. |

The existing typed VCS recovery table remains the source for structured error recovery.
