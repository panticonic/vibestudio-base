---
name: eval-effect-evidence
description: Interpreting eval lifecycle and confirmed effects.
---
An eval cell's lifecycle, sampled return, native journal and independent effect readback describe different things. A cell may fail after a requested effect was committed. Conversely, a returned success claim without a matching complete journal and independent bytes does not certify the effect.

Keep original run identity and immutable result digests alongside the independent readback. A newer observation cannot silently replace a withdrawn source or turn a prior result into a current one. An exact retry is a new authorized native attempt, not a relabeling of the original. Requested retention is separate from recovering the actual value; absence of a private handoff does not make independently confirmed output disappear.
