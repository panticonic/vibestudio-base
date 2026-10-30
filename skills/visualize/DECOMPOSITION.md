# Visualize: what is natural language and what is crisp

Ported sub-procedures: choosing a response component for an answer, and reading data into the props of one component.

| Part | Form | Why |
| --- | --- | --- |
| Which component (or none) shows this answer | own function, `chooseComponent`, `readout: decision` | The "Choosing components" table and the "skip visuals" list as eleven ordered rules over a description of the data and of the ask. Finite, scored by exact match. ActionButton is folded into Choices (the table offers them interchangeably for "decide where to go next"). |
| Reading the facts into props for Chart, Stats, Compare, Timeline, Checklist, PlaceMap, Choices | own function, `readProps`, typed `ComponentSpec` | Extraction of meaning into typed structure. The return type is a discriminated union, so natlang's own result check rejects a wrong shape before any crisp code runs. |
| Strict validation (no unknown props, enums, required fields, same keys in every chart row, numbers plottable, coordinates in range, `Choices` id a slug) and the MDX tag | crisp `renderComponent` | The skill says an invalid prop set shows the user a notice. Exactness belongs in code, and the MDX is written in one place so no message ships a tag the component rejects. Errors name the fix. |
| Calculator (its `compute` function) and one-off components | not ported | Authoring code, not extraction. The agent writes it (kept as an agent skill). |
| Prose around the components, caveats, sources | stays with the agent | Open-ended writing. |
