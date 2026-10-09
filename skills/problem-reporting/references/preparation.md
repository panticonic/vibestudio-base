# Report preparation

Reports use the strict bundle schema `vibestudio.problem-report.v1`. Build content from the live service schema and the returned draft; don't invent JSON fields.

Size limits:

- narrative: 128 KiB UTF-8, counted separately;
- selected diagnostics: 256 KiB;
- attachments: at most five, 7 MiB decoded;
- whole report as canonical JSON: 10 MiB.

Never silently shorten the user's narrative or a chosen attachment.

`problem.operation` and `problem.code` are product identifiers, not prose. Use
the known operation token (for example `eval.returnImage`), or `null` when
unknown. Tokens allow letters, digits, `_`, `.`, `:`, `@`, `/`, and `-`, but no
spaces. Put human-readable descriptions in `symptom`, `expected`, or narrative.

Every new reference entry gets its own UUID, local to the report. Its
`coordinate` holds the panel, invocation, build, or other source identifier;
that identifier is not the entry's UUID:

```ts
content.references.push({
  id: crypto.randomUUID(),
  kind: "panel",
  coordinate: panel.id,
});
```

Preserve the entry's UUID when editing it, just as for evidence.

Narrative section kinds: goal, symptom, expected, reproduction, timeline, impact, investigation, findings, hypotheses, attempts, verification, questions. Each section has an author label, a claim classification, Markdown, and evidence IDs; the host assigns its ID and records its author. Summarize reasoning and findings; do not export hidden model reasoning. Mark a proposed cause as `inferred`; mark verification `observed` only after you actually ran the check.

```ts
const { revision, sectionIds } = await problemReports.appendNarrative(
  draft.id,
  draft.revision,
  [
    {
      section: "findings",
      authorLabel: "Assistant",
      claims: "unverified",
      markdown:
        "The user described an incorrect result. I have not independently reproduced it.",
      evidenceIds: [],
    },
  ],
);
// Later: revise that section by its ID.
await problemReports.patchNarrative(draft.id, revision, sectionIds[0], {
  claims: "observed",
  markdown: "Reproduced: the same input gives the same wrong result.",
});
```

An empty `evidenceIds` list is valid when no extra evidence was selected.

Evidence entries record the source, coordinate, `capturedAt`, completeness, reason, retained and omitted counts, and redactions. Prefer bounded snapshots: 100 records of runtime or server logs; for one invocation, 20 events, 20 commands, and 50 effects. Events close in time are context, not proof of cause. If a build version or panel attempt is unavailable, leave it out rather than guessing.

Before freezing the report: remove secrets and sensitive structured fields, strip URL query strings and userinfo, replace home paths with an alias, and point out any remaining prose or selected binary attachments that may be sensitive. The user reviews the exact canonical bytes. No report may contain receipt secrets, developer keys, credential IDs, or private host paths.
