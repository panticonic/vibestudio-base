# Review a durable question and the participant conditions actually requested

The open entry `reviewDurableQuestion.nl` owns semantic composition. Its body describes its own answer and conditions, rather than imposing every operation in the caller's wider goal on a pure interpretation lambda. The question and participant reviews are independently useful natural-language computations; exact evidence acquisition stays in native typed readers.

The question review returns the actual durable history and a judgment about an individual user question. The native projection preserves identifiers, original text blocks, sequence, publication identity, speaker role and sender. Question interpretation distinguishes genuine questions from quotations, withdrawals, settled requests and ordinary updates.

The participant review is used for an actual membership requirement. It returns the observed roster and the strict participant judgment derived from it. A display name, another channel, an empty or incomplete roster, or an ambiguous role cannot establish a current identity. Historical inactive entries must remain inactive rather than being reported absent.

A request may condition membership review on there being an actionable question, or may ask only about quoted text. An unrequested participant finding is `{status:"not-requested",member:null}` with no roster receipt; it makes no claim about membership. If membership is requested, the actual roster receipt and strict judgment are preserved. Any provided receipt remains native evidence, never a synthesized marker. The open coordinator interprets those obligations from the user's goal and observed facts, without a fixture classifier or a prescribed tool route.

The returned read-only answer retains the exact history receipt, channel and question. Its readiness reflects the actual question and required participant conditions. No operation sends a message or changes the conversation. The existing `reviewChannel` entry continues to handle tail summarization and health triage.
