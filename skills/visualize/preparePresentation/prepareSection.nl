---
description: Choose, ground, and render one view or report the next step it needs.
args:
  section: PresentationSection
returns: PresentationView
budget: { maxTurns: 16 }
---
1. Call chooseComponent(section.data, section.ask). For Prose, return an id and a plain view. For Calculator, Diagram, or OneOff, return an id and a deferred view with that component choice.
2. For a data component, call checkAvailability(section, component). If the source is missing facts that the ask requires, return an id and a needs-review view with that reason.
3. Call readProps(section.data, component, section.ask) for structured props. Call checkReadback(section, component, spec) with those exact props. If the readback rejects the props, return an id and a needs-review view with that reason.
4. Call render.renderComponent(spec) to make the ready view. Preserve its returned component, props, and mdx in the rendered field. If the renderer rejects the props, return an id and a needs-review view with the renderer's reason.
