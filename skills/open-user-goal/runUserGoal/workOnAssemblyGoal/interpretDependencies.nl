---
description: Infer the needed exact package closure and local manifest amendments from live package and source files.
args:
  goal: string
  scope: AssemblyScope
  sources: UnitSource[]
returns: AssemblyDependencies
---
Read the package manifests and relevant source files together. Follow each relevant import from the selected root through sibling workspace packages. For a runtime-only bundle omit test-only and unused optional packages. A type-only import still needs its declared package for a requested source build. Deduplicate shared dependencies. Include the selected root first, then its required packages. Use exact inventory IDs. Identify a required package that is missing, declaration mismatch, or forbidden cycle before building. Propose only the minimal manifest changes when the user asks for a repair draft and the owned dependency is available. Do not propose a new source package or substitute an incompatible provider.

For blockers use short stable terms when they apply: "missing-dependency", "undeclared-dependency", "dependency-cycle", "candidate-unavailable", "export-unavailable", "build-failed", "review-changed". Preserve exact evidence in the rationale.
