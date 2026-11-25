# Extension observation independence

Actual wave0067 Luna generated a parallel reviewSource/reviewRuntime composition.
The source read succeeded, but runtime was refused merely because source had not
yet completed. A later candidate read was refused because that runtime observation
was absent. The goal requested a source/release comparison and internal note; it
did not require this read order. The missing note remains a genuine failed goal;
no historical outcome or trajectory is rewritten.

Before-edit inventory: skills/extensiondev/workflow.ts is the canonical
bindExtensionRelease factory. Its source/runtime native ports are consumed by
reviewExtensionRelease's separate TypeScript leaves, the release workflow and
SST open-goal-extension-dossier-managed.ts. Native source inspection reads exact
assigned immutable VCS heads; runtime inspection reads the exact declared native
extension and verifies name/source. Neither read grants authority to the other.
The declaration and service types contain no single-read or ordering contract.

Remove only the sourceObserved and runtimeRead bookkeeping gates. Runtime reads
remain bound to the unguessable operation coordinate and exact native identity,
and propagate native errors. Repeated reads expose actual changed state. SST's
candidate read similarly uses its existing assigned immutable-head snapshot,
without requiring earlier actor source/runtime reads. Write staging retains its
existing current-head, original owner, scope, decision and persisted-byte checks.
No added service, authority, model call, automatic retry or route is introduced.

Actual Base verification: four tests passed, covering runtime-before-source,
overlapping delayed source/runtime reads, a changed native refresh, foreign
operation refusal before effects, foreign native identity refusal and unchanged
native error propagation. SST's model-free qualification reference now requests
the independent reads together; its next actual full native execution remains
unchecked. This is not an all-family route-gate closure: other authored evidence
coverage requirements remain subject to their user-goal/native-contract audit.

Engines, runtime SDKs and training readers do not enforce these application read
preconditions. Their source and capture schemas are unchanged by this fix.
