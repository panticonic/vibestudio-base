# Owned operational handoffs

Policy is six typed natural-language stages. The program owns no host identities by guessing names.

| Existing product behavior | Port | Reason |
|---|---|---|
| agents skill: narrow addressed responsibilities, explicit lifecycle ownership | root + incident assignment stage | Plan semantic responsibilities and coordinate actual separate owned workers. No broadcast or directory guessing. |
| agent-orchestration: start, inspect, read child outcome, coordinate | incident / assess / synthesize | Independent impact and recovery reviews become persisted worker outputs, reread before synthesis. |
| worker lifecycle: exact created handle, stateArgs, RPC result, cleanup | ownedOperations service | Host I/O, scope and ownership checks are exact mechanism. |
| runtime context isolation, parent-child teardown | ownedOperations.open/close | Context IDs come from createContext, not text authored by the model. |
| runtime supervision restart and durable continuation | release / assessGate | A second revision must use the same actual worker and retained first checkpoint. Restart is a real driver call. |
| cleanup on failure and persisted evidence | caller finally + independent oracle | Ownership bookkeeping and exact invariant checks must work even if a model throws. |
| outer agent completion report validation | omitted as training target | Teacher collection targets only actual Natlang calls; no invented outer-agent trajectory. |
| subagent semantic VCS merge | separate existing workflow | This task coordinates runtime-owned worker state, not code changes or branch integration. |

Two scenarios are deliberately different: parallel incident roles with a synthesized handoff, versus sequential release-gate checkpoint/actual runtime restart/updated evidence. They share the same typed lifecycle capability; they are not two textual seeds of one wrapper.

No local world simulator stands in for product execution. The service factory receives the actual initialized WorkspaceRuntime; its private audit is not exposed to the model. The worker stores typed reports in SQLite. An independent oracle reads the stored checkpoints through fresh RPC immediately before cleanup and checks authoritative absence after cleanup. The runtime source/build identity is preserved on the actual handle. Do not launch before service catalog registration and installed worker build are verified.

