---
description: Review declared services and the compiler-validated selectors for each service.
args:
  contract: AuthoringContract
  candidate: CompiledProgram
  baseline: CompiledProgram | null
returns: AuthoringFinding[]
---
1. Call checkServices with the candidate and baseline service names.
2. For each declared candidate service, check whether expectedServiceScopes contains an entry for its name. An explicit null counts as an entry. Pass that expectation and the candidate selectors to compareSelectors. Otherwise, when preserving a baseline and that baseline declares the service, compare the corresponding baseline selectors.
3. Use null for an omitted scope entry on a declared service. Keep empty selector lists as lists. When no scope comparison is requested by step 2, do not infer one. Return the declaration findings followed by the scope findings.
