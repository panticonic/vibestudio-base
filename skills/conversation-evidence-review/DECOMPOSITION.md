# Conversation evidence review

The chat panel and agentic-chat guides own browser capability selection,
conversation routing and actual visible delivery. The agent worker and
agentic-do guides own turn admission, supervision and terminal execution.
The PubSub and protocol guides own causal envelopes, participant state and
the one canonical event vocabulary.

The program reviews these boundaries through typed branches. Delivery checks
accepted rows and settlement. Surface review checks exact context before
display and completion. Protocol review checks stored vocabulary and
historical consumer evidence. Chat handoff uses the live audit to choose
what the next operator should do. All four use caller-supplied evidence.

## Delivery history

A delivery audit starts from a receipt's causal message ID, sender, and channel.
A scoped service reads the native channel log and one consumer's projection.
The binding selects retained rows by causal ID and retains coordinates and text.
The root delegates origin and consumer checks to separate lambdas. Origin
checks the channel before cardinality and the sender. A foreign channel,
an absent causal message, or a sender mismatch stops before consumer comparison.
Consumer comparison
checks identity before the exact payload. Keep the original observation in
the report so a handoff can cite it. A delivery audit has no send, edit,
capability, or reconciliation service.

## Browser delivery audit

The assigned chat panel and delivery receipt stay paired for the entire review.
`reviewChatDelivery` reuses the durable channel and consumer review as its
first stage. A foreign receipt or failed durable/consumer match ends the
review before a browser read. The workflow distinguishes those failures from
a stale panel and a missing, duplicate, or divergent visible row.

| Part | Form | Why |
| --- | --- | --- |
| Decide whether to proceed from durable history to the browser | `reviewChatDelivery` | The delivery verdict determines whether any panel observation can answer the question. |
| Read the assigned panel attempt, channel, and DOM | `inspectPanel` with a scoped service | Only the host resolves the assigned handle and reads its DOM. The program receives bounded evidence. |
| Validate panel identity before considering its contents | `checkPanel` | A matching transcript in a different panel, channel, or context cannot prove delivery. |
| Compare the single rendered message with the accepted history | `checkMessage` with a crisp comparison | Message identity, cardinality, and text equality are exact. |

For a conversation handoff, `reviewConversation` delegates the live chat audit to
`reviewChatDelivery` and passes its report to `chooseChatHandoff`. That decision
distinguishes tracing an unverified receipt, reopening the correct chat, and
inspecting a divergent renderer. The report retains both the original audit and
the next step. The handoff proposes an action and performs only bounded reads.

## Temporary notification lifecycle

`runNotificationLifecycle` presents one assigned shell notification, passes the
host-issued identity to its cleanup step, then calls
`confirmNotificationLifecycle` for the final receipt assessment. The presentation
and cleanup lambdas each have one scoped service. TypeScript owns the allowed
payload, the host calls, and exact readback checks.
