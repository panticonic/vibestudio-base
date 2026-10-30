# Templates: what is natural language and what is crisp

Ported sub-procedures: the errors-and-remedies lookup, and a template summary. Selected-file transfer, publication, and workspace creation stay with the agent and their approval flows.

| Part | Form | Why |
| --- | --- | --- |
| Error text to remedy (connect a credential, stop on integrity, retry later, re-inspect authoring, fix a dependency, check the publication outcome, unrecognized) | own function, `templateRemedy`, `readout: decision` | The templates extension throws plain `Error`s with prose messages (only the credential error carries a code), so classification is interpretation of text. Finite outcome, scored by exact match. The remedy text itself stays in `references/errors-and-remedies.md`: it is documentation the agent reads when the label says which row applies. |
| What kind of template an inspection describes (base, personal, system, development, catalog) | own function, `templateRole`, `readout: decision` | Judged from what the repositories are and what the template depends on. |
| Name, description, commit, dependency URLs, repository counts per folder | crisp helper `summarize` | Read directly from the inspection; counting is exact. |
| One-sentence prose summary | not ported | An open-ended sentence has no exact scorer; the typed summary carries what a decision needs. |
| Whether private source needs credentials; integrity and manifest validation | the extension | Exact checks that already exist. The remedy "stop, show the details, don't substitute another source" is stated by `stop-integrity`. |
