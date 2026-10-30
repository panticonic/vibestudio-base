# Workspace development: what is natural language and what is crisp

Ported sub-procedures: choosing a unit's identity icon, and diagnosing a panel that does not load. Scaffolding, forking, dependency policy, and the debug loop stay agent skills (open-ended coding).

| Part | Form | Why |
| --- | --- | --- |
| Whether a unit shows a brand mark, a Lucide object, or an emoji, and which one | own function, `iconIntent`, typed `{ family, term }` (in `natlang/`) | The icons guide gives an ordered choice (brand of a technology it implements, a concrete Lucide object for a concept, an emoji only when it says more). Naming a Lucide icon is open-ended, so it is a typed reading, not a decision readout. |
| Whether the name exists, and the nearest real names when it does not | crisp, `resolveIcon` over the caller's `fs` | The catalog is 2,000 files plus eight brand marks: exact lookup, with the words of a near-miss turned into real candidates in the error. The model never has to remember the catalog; `setUnitIcon` and `prepareUnitIcon` check again at the authoring edge. |
| Emoji validity | crisp (`Intl.Segmenter`, one grapheme, pictographic) | Exact. |
| Panel load diagnosis from `observe()` / `diagnose()` | **crisp** table, `diagnosePanelLoad` | The evidence is typed: `phase`, `failure.code`, `failure.stage`, `host.reachable`. PANEL_API.md says to read `failure.code` instead of matching message text, and each code names one layer and one escalation. The table is exhaustive over `PanelFailureCode`, so a new code does not compile until it has a route. No interpretation is left for a model. |
| Repairing the source once the layer is known | stays an agent procedure | Open-ended coding. |

The icon program lives in `natlang/` because the skill directory holds large unrelated TypeScript. `diagnosePanelLoad` has no executor baseline: it makes no model call.
