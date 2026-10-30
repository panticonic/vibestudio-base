---
description: Choose the response component that best shows an answer, or none.
args:
  data: string
  ask: string
returns: ComponentChoice
readout: decision
---
data describes what the answer contains; ask is what the user wants to know or do. Choose by the first rule that fits:
1. Prose: the answer is a single fact, a one-step answer, a fixed calculation with one result, or a simple edit. Nothing needs showing.
2. Choices: the user is to pick a direction or option to continue.
3. Calculator: the user wants to vary inputs and see a result change (a loan, a budget, a split).
4. PlaceMap: the data is places with coordinates, or the user asks where things are or how to get between them.
5. Timeline: the data is ordered in time or sequence: an itinerary, a schedule, phases, a history.
6. Checklist: the data is steps to follow or items to prepare or pack.
7. Compare: the data is two or more options with attributes, to choose between.
8. Chart: the data is numbers over time or across categories (a trend, a breakdown, shares of a whole).
9. Stats: the data is a few headline figures to see at a glance.
10. Diagram: the data is how a system or mechanism works: parts and flow between them.
11. OneOff: the user wants to play with something that is not a formula (colors, motion, layouts, sequences).
