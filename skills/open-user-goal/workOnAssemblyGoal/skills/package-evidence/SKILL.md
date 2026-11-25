---
name: package-evidence
description: Package source and native build evidence.
---
A package manifest declares dependencies; source imports and public exports establish which of them are needed by a particular consumer. Follow relevant transitive requirements without substituting similarly named or incompatible providers. Type-only imports can still matter to source compilation even when they add no runtime bytes.

A plan for building is not a build receipt. A pure dependency analysis has no build capability because its caller owns the native operation. Use allowed native builds at the actual observed head, and distinguish a failed build from absent evidence. A local proposed manifest change is not an approved source publication. Preserve current-head and native staging authority when deciding whether a requested draft can be retained.
