# Program review

`reviewProgram` checks an assigned candidate and optionally an assigned baseline.
It uses the same compiler inspection surface as `natlang.describe`. A caller
supplies the source paths and immutable revision identities. The program can
inspect the assigned roles and return a review.

| Stage | Responsibility |
| --- | --- |
| `inspectRevisions/readAssignedProgram` | Use the given role to obtain the compiler evidence |
| `triageCompiler/prioritizeDiagnostic` | Choose the first actionable compiler problem, preserving its source and diagnostic code |
| `reviewContract/checkSignature` | Compare the entry, named parameters and return type to the intended interface and any baseline |
| `reviewContract/checkAuthority/checkServices` | Check declarations and authority drift |
| `reviewContract/checkTopology` | Check that required helpers are exposed in the correct callable folder |
| Binding | Scope reads to the two assigned roots, format compiler positions and project the exact signature |
| Verifier | Independently join outcome and findings to source revisions and compiler readbacks |

The review stops before invoking an inspected callable and can report an unusable
baseline separately from a broken candidate.

Service declaration and service scope are separate contract checks. The compiler
inspection returns validated selectors from the same configuration used to load
the candidate. The authority reviewer checks the declared services, then sends
scopes to a nested comparison lambda. The comparison preserves the distinction
between unrestricted access, exact callable selectors, call-chain selectors,
and an empty selector list. It uses explicit scope requirements before falling
back to the baseline. A declaration change is reported by the declaration
reviewer.
