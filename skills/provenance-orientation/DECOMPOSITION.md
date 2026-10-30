# Provenance orientation: what is natural language and what is crisp

Ported sub-procedure: picking the mechanism for a provenance question (the table "Pick the mechanism for your question").

| Part | Form | Why |
| --- | --- | --- |
| Question to mechanism | own function, `provenanceMechanism`, `readout: decision` | Ten finite outcomes chosen from the wording of a question; the table is already ordered by what each question asks. Scored by exact match. The call itself (`provenance({ target, walk })`) is a one-line template the agent already has in the skill. |
| Inferring the underlying constraint from cause, cohort and rejections | stays an agent procedure | Open-ended reasoning over returned evidence, including the warning not to dismiss a rejection because its subject differs. It needs the frontier model. |
| Interpreting evidence narrowly (stated, trigger, mechanical) | stays in the skill text | Judgment about what a record permits the agent to claim. |
