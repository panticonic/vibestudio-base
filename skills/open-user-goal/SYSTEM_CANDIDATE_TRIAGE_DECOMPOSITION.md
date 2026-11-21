# Diagnose a staged System template conflict

## Native mechanism inventory

- Native Templates `prepareUpdate` records the approved target and isolated
  semantic VCS context. `reviewUpdate` reads the exact current conflict
  coordinate/delta. `readUpdateFile` reads base and incoming blobs from the
  composed source manifest and reads local content from the isolated working
  VCS head. `resolveUpdate` mutates an explicitly matched coordinate. Reuse
  the read methods and the exact preview projection. No proposed family
  exposes resolve or publish.
- The CLI consumes `readUpdateFile` through the
  same service schema. Preview limits should count UTF-8 bytes consistently
  on the immutable blob and the working text. The service supplies labels for
  binary and over-limit data. The CLI forwards the preview unchanged.
- The semantic VCS engine's `threeWayTextMerge` and `classifyMergeAspect`
  distinguish clean composition, convergence, conflicting line changes,
  absent sides and bounded comparison. Use the same primitive for
  independently observed text, with no manufactured body for binary or
  unavailable previews. No rendered display is assumed.
- Earlier goals inspect update offers, authorize preparation and review
  workspace composition or deployment. This family starts from an
  already-staged System update with coordinate-level evidence, and ends with
  a conflict-specific private report or a hold.

## Proposed callable stages

1. Find the exact assigned staged operation and coordinate. Confirm its owner,
   baseline and operation state by reading the native review.
2. Compare the native base, local and incoming views independently. Decide
   whether a clean composition, explicit side selection, missing source or
   blocked evidence is warranted.
3. Re-read the exact native conflict coordinates and current frontier before
   a private handoff. Record an exact source-bound artifact or hold. No change
   to template, deployment or review content.
