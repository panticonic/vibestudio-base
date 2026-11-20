# Retained provider approval and conversation handoff

This family reviews decisions and provider results already retained in a
conversation. A pending presentation, a historical grant, a delivery result
and permission for a future external action are distinct boundaries.

| Boundary | Existing mechanism and decomposition |
| --- | --- |
| Queue visibility and caller | Mount capabilities/natlang reviewApprovalTransition and its approval-visibility children. Compare exact prior and current receipts using the viewer's actual role in the retained record. A missing visible queue item does not imply consent. |
| Original delivery identity | Mount conversation-evidence-review reviewConversation in delivery mode. Preserve its exact accepted envelope, settlement, source channel and recipient evidence. Never send a replacement. |
| Device attribution | device-and-terminal-review distinguishes host-rendered approvals from panel-drawn prompts and checks principal and context. Reuse that boundary in the retained record interpretation. These cases do not create live device or provider approvals. |
| Native owned evidence | Reuse System Testing createOwnedHeadlessChannel and HeadlessSession. Append explicitly synthetic provider-approval and result records to native, disposable conversation state and join the actual durable message and frontier. Exact retained result text uses native blobstore. No real provider credentials or side effects. |
| Open decisions | Select the correct conversation, review the typed queue and delivery children, recheck any changed frontier, then decide the supported outcome and evidence set. The model owns the semantic decision. |
| Handoff | Reuse scratch-handoff-bindings for exact selected provider metadata and redacted evidence keys after fresh readback. Independently check the native conversation, retained bytes and final artifact. Scope authentic local handoff permission only. |
