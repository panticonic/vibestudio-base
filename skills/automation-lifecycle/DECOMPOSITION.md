# Reconcile an assigned automation transition

| Behavior | Representation |
| --- | --- |
| Locate the automation the caller has already selected | The binding reads exactly one mission ID through the caller's Missions client. It projects the state and revision digest, leaving the charter and authority plan in their owning service. |
| Decide whether the requested state change is still appropriate | A Natlang stage interprets availability, lifecycle and the caller's expected revision. An already satisfied request is resolved from observation. |
| Apply a reversible transition | A separate scoped Natlang stage calls the existing pause or resume method once. Exact TypeScript guards verify the assignment and read the current revision again before the effect. The receiver owns authorization. |
| Determine whether the change took effect | A Natlang stage compares the acknowledged transition with a fresh mission read. Ambiguous acknowledgments and changed definitions preserve uncertainty. |
| Recover after an interrupted operation | The workflow reads back once and reports the evidence. It never places a retry or starts a run on its own. |

The existing conversation tool still resolves names and ambiguous selections. This package handles a caller-authorized pause or resume for an exact mission revision. The host's ownership, admission and scheduling contracts continue to govern the actual change.

The controller's pause and resume methods take a mission ID. Another editor can
change the definition between the binding's final pre-effect read and that call.
The workflow preserves uncertainty when the post-effect revision differs.
