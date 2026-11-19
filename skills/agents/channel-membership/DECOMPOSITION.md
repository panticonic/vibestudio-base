# Channel agent membership

| Product behavior | Representation |
|---|---|
| Interpret the assigned attach, detach or inspect request | Root lambda coordinates observation, decision, effect and reconciliation. |
| Determine whether the selected worker owns this handle and interpret a missing or conflicting membership | Nested decision lambda chooses a guarded branch over exact roster evidence. |
| Preserve workspace defaults and admit prior history only for the selected attach | Nested attach policy names the requested response mode and replay choice. TypeScript compares both against the caller's assignment at the effect boundary. |
| Select the channel context and the per-channel worker key | The existing agents helper and exact caller-owned service scope. The model receives no general-purpose launch or RPC method. |
| Subscribe or unsubscribe | The existing agents helper performs the authorized operation and preserves workspace review behavior. Independent read and write capabilities expose only the assigned handle. |
| Reconcile a prior effect, incomplete acknowledgment or failed read | Nested confirmation policy distinguishes observed final membership, rejected effect and unknown outcome. No fresh write follows an ambiguous result. |
| Resolve mentions and send to agents already on the roster | The shared program's messaging workflow handles message delivery separately. |
| Recover panels after local model switches or move between forks | Chat host recovery still owns those UI-specific lifecycle operations. This program acts within the assigned channel. |

The canonical roster is used by the ChatHostController and PubSub channel, and the canonical effect helpers remain used by existing chat and product surfaces. The adapter projects the same durable worker identity. It does not change any channel protocol, workspace review mechanism or model serving engine.

## Roster plans

`runRosterPlan` sequences the caller's exact requests across channels and
reuses `manageChannelAgent` for each one. `checkPriorOutcome` holds writes in
a channel after a conflicting or uncertain observation and allows a fresh
inspection or an operation in another assigned channel. Underlying roster
reads and changes remain in the channel membership services.
