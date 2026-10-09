---
name: visualize
description: Proactively answer with visuals and interactive tools in chat — charts, maps, timelines, comparisons, calculators, checklists, and follow-up choices. Use to show how something works, explore what-if, compare or decide, plan, or present data; the user does not need to ask.
---

# Visual and interactive answers

A good answer often shows instead of tells. When a response helps the user
understand, compare, decide, plan, or act, compose it from text plus response
components. The user does not need to request a visual.

Prefer visuals and interaction for:

- how something works, cause and effect, and "what happens when";
- options side by side, trade-offs, and decisions;
- numbers over time, breakdowns, and key figures;
- schedules, itineraries, routes, and places;
- what-if math with inputs to vary: budgets, loans, conversions, estimates, or alternate split scenarios;
- procedures, packing lists, and setup steps;
- narrowing questions and next steps the user picks from.

Skip visuals for single facts, one-step answers, simple edits, and anything a
short paragraph already makes clear. Compact notation and small code examples
are not visualizations.

## Two surfaces, one vocabulary

The same response components work in both places:

| Surface | Write | Use when |
| --- | --- | --- |
| MDX in your message | `<Chart ... />` tags with JS-expression props | Presentation plus simple follow-ups. Default choice. |
| `inline_ui` tool | TSX importing from `@workspace/react` | The UI needs its own state, logic, live data, or workspace calls, or the user will return to it. |

[COMPONENTS.md](COMPONENTS.md) documents every component and prop. Radix
layout and text components (`Flex`, `Grid`, `Box`, `Card`, `Tabs`, `Table`,
`DataList`, `Callout`, `Badge`, `Progress`, `Separator`, `Heading`, `Text`,
`Link`, `Icons`) compose them. Mermaid fences and `<Diagram>` cover structure
and flow; see [MDX.md](../sandbox/MDX.md) for media.

## Choosing components

| The user wants to… | Compose |
| --- | --- |
| plan a day, trip, or event | `PlaceMap` + `Timeline`, then `Choices` to refine |
| choose between products, plans, or approaches | `Compare`, optionally `Chart` for the numbers that matter |
| see a trend or breakdown | `Chart` (+ `Stats` for headline figures) |
| explore how a result changes as inputs vary | `Calculator` |
| follow a procedure or prepare | `Checklist` |
| understand a mechanism or system | a mermaid diagram, `Timeline` for phases, or a `Calculator` that exposes the cause-and-effect |
| decide where to go next | `Choices` or a few `ActionButton`s |

Lead with one framing sentence, show the components, and keep commentary to
what the components cannot say: caveats, reasoning, and sources.

## Interaction loop

`Choices`, `ActionButton`, and `chat.send(..., { metadata: { interaction } })`
send a user message carrying a structured `interaction` object with
`source`, `kind`, `action`, `targetId`, and for `Choices` the selected
`values`. Treat it as the exact selection.
Give every `Choices` a stable, descriptive `id` so the follow-up names it.

When the conversation can continue without an answer, offer non-blocking
`Choices` rather than blocking. Use `ask_user` or `feedback_form` only when
you cannot proceed without the answer.

## Writing MDX that renders

MDX renders once the message completes. A message whose MDX fails to compile or
render falls back to plain text, and you receive a ui-feedback note on your next
turn. The same is true of `inline_ui` components and `load_action_bar` bars. A
catalog component whose props are rejected shows the user a notice instead, and
you receive a ui-feedback note naming the component and the problems. Repair and
re-render; do not abandon the visual.

- Close every tag; self-close components without children (`<Stats ... />`).
- Quote string props; put numbers, arrays, objects, and functions in braces:
  `data={[{ month: "Jan", sales: 12 }]}`, `compute={(v) => [...]}`.
- Use only documented components and props.
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
    { name: "Miradouro da Senhora do Monte", lat: 38.7193, lng: -9.1326, emoji: "🌅" },
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
