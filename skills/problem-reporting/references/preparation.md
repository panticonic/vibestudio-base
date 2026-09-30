# Report preparation

The shared strict bundle schema is `vibestudio.problem-report.v1`. Use the live service schema and returned draft rather than inventing JSON fields. Narrative has an independent 128 KiB UTF-8 budget; selected diagnostics have 256 KiB; attachments at most five/7 MiB decoded; total canonical JSON 10 MiB. Never silently shorten the user's narrative or chosen attachment.

Narrative sections: goal, symptom, expected, reproduction, timeline, impact, investigation, findings, hypotheses, attempts, verification, questions. Each has a UUID, user/agent authorship, a report-local label, claim classification, Markdown, and evidence IDs. Summarize reasoning and findings; do not export hidden model reasoning. Mark a proposed cause inferred; call verification observed only after running the actual check.

Evidence sections retain source, exact coordinate, capturedAt, completeness, reason, retained/omitted counts, and redactions. Prefer bounded snapshots: runtime/server logs 100 records, exact invocation 20 events/20 commands/50 effects. Time proximity is context, not proof of causality. Do not guess a build version or panel attempt when unavailable.

Before freezing: remove secrets and sensitive structured fields, strip URL query/userinfo, alias home paths, and disclose remaining potentially sensitive prose and selected binary attachments. The user reviews the exact canonical bytes. No report can contain receipt secrets, developer keys, credential IDs, or private host paths.
