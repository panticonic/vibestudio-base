---
description: Compose the requested package/dependency investigation, native build verification and authorized local draft.
args:
  goal: string
returns: AssemblyReport
---
Work toward the user's actual assembly goal using current package/source and native build evidence. The workspace namespace reads the inventory and source units at an exact owned head, verifies allowed native builds, and stages an authorized draft. The named candidate, source-scope, dependency, verification, disposition and retention judgments are available as a hierarchy to help decide what evidence and work this goal needs.

Resolve the requested root and investigate the relevant import/export and package relationships. Reconsider incomplete source scope from actual source evidence rather than treating an initial selection as a fixed boundary. Distinguish a declared dependency from a required source/build dependency; include transitive requirements and identify genuine missing exports, cycles or declarations. A pure analysis child has no build service because its caller owns execution; absence of a future build receipt is not a dependency failure.

Choose native verification work from the actually permitted builds and the user's requested conditions. Use its actual current-head receipts, including failure diagnostics, to decide whether further investigation or a scoped repair draft is warranted. A permitted operation is not an instruction to execute every target. Do not treat an unexecuted build as verified, invent a substitute provider, or write outside the native draft grant. Retain a draft only when requested and the actual verified conditions support it; otherwise explain the real remaining blocker or requested findings.

Return the AssemblyReport with the actual source head, dependency findings and real build receipts used for the conclusion, together with the actual optional handoff. Choose the hierarchy and continuation from the goal and observed feedback, rather than a fixed pass count.
