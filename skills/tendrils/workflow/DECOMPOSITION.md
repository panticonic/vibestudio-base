# Tendril workflow

A caller assigns the source, channel and context for a page, plus the fields,
function calls and source candidates it owns. The workflow chooses an
available presentation target, then runs the requested operations against the
same slot and checks the returned page state.

| Responsibility | Natural-language stages | TypeScript boundary |
| --- | --- | --- |
| Present the page | Choose an online device in preference order. Distinguish a pending presentation from a usable page. | List native presentation targets and create the assigned Tendril and slot via the agent SDK. |
| Work on the running page | Inspect its starting state. Delegate and verify each requested state change and exposed function call in order. | Apply an exact shared-state operation or invoke a function declared by the assigned page. Read a bounded page snapshot and the durable revision. |
| Change the build | Establish the current build. Apply the candidate and decide whether the page reached it, kept the previous build, or needs its previous build restored. | Bind each candidate to the caller's source edit. Read the same presentation after native update and history operations. |
| Handle missing evidence | Hold a dependent operation when the preceding effect cannot be confirmed. | Reject calls outside the assignment and preserve before and after receipts. |
| End a task | Report only the completed steps and pending presentation or blocked operation. | The caller closes any objects it assigned for temporary work. |
