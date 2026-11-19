# Conversation evidence review

The chat panel and agentic-chat guides own browser capability selection,
conversation routing and actual visible delivery. The agent worker and
agentic-do guides own turn admission, supervision and terminal execution.
The PubSub and protocol guides own causal envelopes, participant state and
the one canonical event vocabulary.

The program reviews these boundaries through three typed branches:
delivery checks accepted rows and settlement, surface review checks exact
context before display and completion, and protocol review checks stored
vocabulary and historical consumer evidence. It uses actual caller-supplied
receipts. The existing transport, reducers, authority, test tools and
workspaces retain their behavior and effects.

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
