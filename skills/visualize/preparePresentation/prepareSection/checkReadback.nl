---
description: Check a proposed component against its original section before rendering.
args:
  section: PresentationSection
  selected: DataComponent
  spec: ComponentSpec
returns: PresentationReadback
budget: { maxTurns: 6 }
---
Compare the proposed component to selected and the displayable facts to section.data.
1. Check that the component matches and the displayed rows, items or options cover the facts that the ask needs.
2. Check labels, values, units, coordinates and ordering against the assigned source. A missing measurement is unknown. A layout suggestion is not evidence for a number, date, URL, location, status or recommendation.
3. If a material fact is missing, altered, or unsupported, return rejected with a concrete reason. Otherwise return accepted. Do not rewrite the props here.
