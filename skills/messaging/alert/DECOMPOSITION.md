# Messaging: what is natural language and what is crisp

Ported sub-procedure: choosing the alert rung of a `notify` call. Sending stays with the agent (an interrupting notification is a consequential effect); the function returns the rung as a proposal.

| Part | Form | Why |
| --- | --- | --- |
| none, inbox, or interrupt for a message | own function, `alertRung`, `readout: decision` | A three-way finite choice that depends on meaning ("something they would want to be pulled away from"). Scored by exact match, with the probability vector available to a caller that wants a floor. |
| Recipient kind (channel, person, supervisor, subagent, other agent) | an argument | The agent knows who it is addressing; deriving it from prose would add a place to be wrong. Rule one of the function is then exact. |
| The user's or recipient's stated preference | an argument (`stated_preference`), read by one instruction | Free text the program cannot enumerate; the instruction says what it overrides. |
| Resolving a name to an addressee ref | not ported here | Needs the `addressees` service (plan wave 2). The send itself stays agent-side. |
| Whether to send at all (etiquette: notable events only) | stays in the skill text | A judgment about the whole conversation, not about one message. |
