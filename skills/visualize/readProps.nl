---
description: Read the facts in data into the props of one response component.
args:
  data: string
  component: DataComponent
returns: ComponentSpec
budget: { turnTokens: 1024 }
---
Return a ComponentSpec whose component is the given component and whose props show every fact in data and nothing else.
1. Copy each name, number, date, time and place from data exactly as written; do not round, convert or invent values.
2. Chart: one row per x value, every row with the same keys, numbers as numbers; set x to the key that names each row and y to the key (or keys) holding the numbers.
3. Stats: one item per headline figure, with label and value; put a change or comparison in delta and a qualifier in detail.
4. Compare: one option per thing compared, with name; put its figures in attributes, price in price, and strengths and weaknesses in pros and cons.
5. Timeline: one item per step, in order, with title and, when data gives one, time.
6. Checklist: one string per item, in order.
7. PlaceMap: one place per location with name, lat and lng as numbers; set route to true only when data describes a route in order.
8. Choices: options are the directions data lists; id is lowercase words joined by hyphens.
