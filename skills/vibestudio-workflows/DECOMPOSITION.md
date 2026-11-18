# Vibestudio workflow program

`runWorkflow.nl` is the shared entry for high-level Vibestudio work. It chooses which assigned work to do, orders dependent requests, and retains each skill's result. The caller supplies a goal, typed work grounded in the assigned workspace, and only the live services granted for that run. A scenario's identity, expected outcome, credentials and verification code stay in the caller.

| Responsibility | Implementation |
| --- | --- |
| Interpret the goal and choose among the assigned work | `runWorkflow.nl` decides when to call the skill roots and how to explain a blocker. |
| Diagnose and repair source | `repairUnit` uses diagnosis, cause explanation, proposal, and verification lambdas. Compiler, revision editing and workerd execution are caller services. |
| Restore panel behavior | `repairPanel` uses interaction, diagnosis, repair and browser-verification lambdas. Live CDP and editing remain caller services. |
| Deliver an evidence-grounded project | `deliverProject` uses analysis, planning, per-page composition and readback review. Navigation completion is an exact TypeScript helper. VCS writes and commit are caller services. |
| Reconcile distinct workspace intents | `integrateWorkspace` uses intent comparison, resolution planning and state verification lambdas. The actual workspace integration is a caller service. |
| Judge observed support | Worker repair and VCS integration call the same typed `checkSupport` lambda. Its native `workspace-evidence` skill provides receipt conventions and is disclosed when the lambda needs them. |
| Continue operational work through owned workers | `operate` chooses incident or release. Each branch owns its own typed stages for evidence, decisions and handoff. Worker lifecycle and state are caller services. |
| Route an owned local conversation | `routeMessage` uses roster inspection, audience resolution, composition, clarification and delivery/readback lambdas. Messaging actions stay in the scoped caller binding. |

Use a callable stage when it makes a distinct judgment or returns a typed result. Use Natlang skill guidance for knowledge, conventions or examples the executing lambda needs in its current context. Keep exact TypeScript computations close to the stage that needs them. The top level sees skill roots. Each skill's specialist stages are visible within its own subtree.

A shared program can run against different caller-owned worlds without acquiring additional authority. Its service declarations describe the complete program. The explicit loading mode binds only the capabilities supplied by the caller, and per-lambda scopes restrict those bindings further. Each scenario's independent oracle inspects actual effects.
