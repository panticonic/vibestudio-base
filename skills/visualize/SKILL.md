---
name: visualize
description: Proactively answer with visuals and interactive tools in chat — charts, maps, timelines, comparisons, calculators, checklists, follow-up choices, and small custom widgets built on the spot. Use to show how something works, explore what-if, compare or decide, plan, or present data; the user does not need to ask.
---

# Visual and interactive answers

When a response helps the user understand, compare, decide, plan, or act,
compose it from text plus response components. Do this without being asked.

Prefer visuals and interaction for:

- how something works, cause and effect, and "what happens when";
- options side by side, trade-offs, and decisions;
- numbers over time, breakdowns, and key figures;
- schedules, itineraries, routes, and places;
- what-if math with inputs to vary: budgets, loans, conversions, estimates, or alternate split scenarios;
- procedures, packing lists, and setup steps;
- narrowing questions and next steps the user picks from.

Skip visuals for single facts, one-step answers, a fixed calculation with one
result, simple edits, and anything a short paragraph already makes clear.
Compact notation and small code examples are not visualizations.

## Three tiers

| Tier                                | Write                                                                                   | Use when                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Response components in your message | `<Chart ... />` tags with JS-expression props                                           | One fits. The default.                                                                                                                                       |
| A one-off component in your message | `import { useState } from "react"`, `export function Widget() {...}`, then `<Widget />` | Nothing in the catalog fits and the widget belongs to this answer: a stepper through a process, a mixer, a small simulation, a diagram that reacts to input. |
| `inline_ui` tool                    | TSX importing from `@workspace/react`                                                   | A durable surface: refreshed under a stable id, calling workspace services or runtime APIs, or something the user returns to.                                |

When a one-off component makes the idea clear, build it rather than settling
for prose or a near-miss catalog component. See [MDX.md](../sandbox/MDX.md#one-off-components)
for imports and an example.

[COMPONENTS.md](COMPONENTS.md) documents every component and prop. Radix
layout and text components (`Flex`, `Grid`, `Box`, `Card`, `Tabs`, `Table`,
`DataList`, `Callout`, `Badge`, `Progress`, `Separator`, `Heading`, `Text`,
`Link`, `Icons`) compose them. Mermaid fences and `<Diagram>` cover structure
and flow; see [MDX.md](../sandbox/MDX.md) for media.

## Choosing components

| The user wants to…                                                            | Compose                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| plan a day, trip, or event                                                    | `PlaceMap` + `Timeline`, then `Choices` to refine                                                       |
| choose between products, plans, or approaches                                 | `Compare`, optionally `Chart` for the numbers that matter                                               |
| see a trend or breakdown                                                      | `Chart` (+ `Stats` for headline figures)                                                                |
| explore how a result changes as inputs vary                                   | `Calculator`                                                                                            |
| follow a procedure or prepare                                                 | `Checklist`                                                                                             |
| understand a mechanism or system                                              | a mermaid diagram, `Timeline` for phases, or a one-off component the user can step through or play with |
| play with something that isn't a formula — colors, motion, layouts, sequences | a one-off component                                                                                     |
| decide where to go next                                                       | `Choices` or a few `ActionButton`s                                                                      |

Lead with one framing sentence, show the components, and keep commentary to
what the components cannot say: caveats, reasoning, and sources.

## Interaction loop

`Choices`, `ActionButton`, and `chat.send(..., { metadata: { interaction } })`
send a user message carrying a structured `interaction` object with
`source`, `kind`, `action`, `targetId`, and for `Choices` the selected
`values`. Treat it as the user's selection. Give every `Choices` a stable,
descriptive `id` so the follow-up names it.

When the conversation can continue without an answer, offer `Choices` instead
of blocking. Use `ask_user` or `feedback_form` only when
you cannot proceed without the answer.

## Writing MDX that renders

MDX renders once the message completes. A message whose MDX fails to compile or
render falls back to plain text. `inline_ui` components and `load_action_bar`
bars that fail to compile are rejected with the compiler error in the tool
result and nothing is shown; their render-time failures are reported. A
catalog component whose props are rejected shows the user a notice instead.

Each visible failure reaches you as a ui-feedback note naming the subject and
the error. If you are idle, it starts a repair turn; otherwise it arrives after
your current turn. Failures in what you publish during a repair turn wait for
your next turn. Fix and re-render; do not drop the visual.

- Close every tag; self-close components without children (`<Stats ... />`).
- Quote string props; put numbers, arrays, objects, and functions in braces:
  `data={[{ month: "Jan", sales: 12 }]}`, `compute={(v) => [...]}`.
- Use only documented components and props, or components you define in the
  message.
- Use real data. Mark estimates as estimates, and never present opening times,
  prices, or schedules as verified without a source.
- Keep each component focused. Several small components read better than one
  overloaded one.

## Example

```mdx
Here's a relaxed day built around food and viewpoints.

<PlaceMap
  route
  places={[
    {
      name: "Miradouro da Senhora do Monte",
      lat: 38.7193,
      lng: -9.1326,
      emoji: "🌅",
    },
    { name: "Time Out Market", lat: 38.7069, lng: -9.1457, emoji: "🍽️" },
    { name: "Belém Tower", lat: 38.6916, lng: -9.216, emoji: "🏰" },
  ]}
/>

<Timeline
  items={[
    { time: "9:00", title: "Sunrise view at Senhora do Monte", icon: "🌅" },
    { time: "12:30", title: "Lunch at Time Out Market", icon: "🍽️" },
    { time: "15:00", title: "Belém Tower and pastéis de Belém", icon: "🏰" },
  ]}
/>

<Choices
  id="lisbon-day-refine"
  question="Want me to adjust it?"
  options={[
    { label: "More food stops" },
    { label: "Less walking" },
    { label: "Add an evening plan" },
  ]}
/>
```
