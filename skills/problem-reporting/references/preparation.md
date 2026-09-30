# Report preparation

The shared strict bundle schema is `vibestudio.problem-report.v1`. Use the live service schema and returned draft rather than inventing JSON fields. Narrative has an independent 128 KiB UTF-8 budget; selected diagnostics have 256 KiB; attachments at most five/7 MiB decoded; total canonical JSON 10 MiB. Never silently shorten the user's narrative or chosen attachment.

`problem.operation` and `problem.code` are product identifiers, not prose. Use
the known operation token (for example `eval.returnImage`), or `null` when
unknown. Tokens allow letters, digits, `_`, `.`, `:`, `@`, `/`, and `-`, but no
spaces. Put human-readable descriptions in `symptom`, `expected`, or narrative.

Every new reference entry has a report-local UUID. Its `coordinate` holds the
actual panel, invocation, build, or other source identifier; those identifiers
are not reference-entry UUIDs:

```ts
content.references.push({
  id: crypto.randomUUID(),
  kind: "panel",
  coordinate: panel.id,
});
```

Preserve the entry's UUID when editing it, just as for narrative and evidence.

Narrative sections: goal, symptom, expected, reproduction, timeline, impact, investigation, findings, hypotheses, attempts, verification, questions. Each has a UUID, user/agent authorship, a report-local label, claim classification, Markdown, and evidence IDs. Summarize reasoning and findings; do not export hidden model reasoning. Mark a proposed cause inferred; call verification observed only after running the actual check.

Use this exact section shape, checked against the live `problemReports.update` schema:

```ts
const section = {
  id: crypto.randomUUID(),
  section: "findings",
  author: "agent",
  authorLabel: "Assistant",
  claims: "unverified",
  markdown:
    "The user described an incorrect result. I have not independently reproduced it.",
  evidenceIds: [],
};
```

Every section needs its own `id`; preserve an existing section's ID when editing it. An empty `evidenceIds` list is valid when no extra evidence was selected. Use `reportDraftContent(draft.value)` to retain the current editable content, append the new section to its narrative, and update using the returned `draft.id` and `draft.revision`. Do not send the full bundle envelope as update content.

Evidence sections retain source, exact coordinate, capturedAt, completeness, reason, retained/omitted counts, and redactions. Prefer bounded snapshots: runtime/server logs 100 records, exact invocation 20 events/20 commands/50 effects. Time proximity is context, not proof of causality. Do not guess a build version or panel attempt when unavailable.

Before freezing: remove secrets and sensitive structured fields, strip URL query/userinfo, alias home paths, and disclose remaining potentially sensitive prose and selected binary attachments. The user reviews the exact canonical bytes. No report can contain receipt secrets, developer keys, credential IDs, or private host paths.
