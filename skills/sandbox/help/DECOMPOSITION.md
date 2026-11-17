# locateDoc and recoverFromFailure: decomposition

One program, `docHelp.nl`, whose callable folder holds both functions, because `recoverFromFailure` quotes the
documentation through `locateDoc` and callable-folder code imports only its siblings. Services: `docs` (the capability
catalog: `search`, `describe`) and `fs` (`grep`, `readText`), each a narrowed view of the caller's own `services.docs`
and `services.fs`, the same catalog the `docs_search`/`docs_open` tools read and the same files the agent reads.

The evaluation fixture loads its Markdown and catalog from the authored `programRoot`, independently of where the
suite module was emitted. It records the exact source passages returned by those services, authenticates every
result quote against them, and requires every answering source to belong to the case's expected source set. Its
observation supplies authenticated passages to a separate semantic reviewer; a correctly named file alone is not
verification. Recovery cases supply no documents, so an invented recovery citation fails the grounding gate.

## `locateDoc(question, scope?): { found, tried }`

| Part | Form | Why |
| --- | --- | --- |
| Search terms | crisp: `docHelp/keywords.ts` | Identifiers (`launch_automation`, `vcs.commit`, `WORKSPACE_RPC_METHOD_UNDECLARED`) first, then content words; at most eight. |
| Candidate files | crisp, in `locateDoc.ts` | One ripgrep over `*.md` (the scope's paths, or the whole workspace); files ranked by the distinct terms their hit lines carry; five read. |
| Candidate sections | crisp: `docHelp/sections.ts` | Split by heading (code fences respected) into whole paragraphs of at most 1200 characters, each an exact slice. Ranked by the terms they contain (identifiers count three). |
| Catalog entries | crisp | `docs.search` with the terms, `docs.describe` of the top two; the entry's own description is the candidate. |
| Does a section answer the question | its own function, `docHelp/fits.nl` (`readout: decision`, `answers \| related \| no`) | Keyword search finds candidates but cannot tell an answer from a mention. A fixed label set per item, not a choice among the candidates. Six candidates at most: each is one scored decision. |
| Result | crisp | The `answers` first, then `related`, three at most, quoted byte-exact with their path and heading. No synthesis step: writing is what failed in `researchBrief/writeBrief`. |

## `recoverFromFailure(failure): { cause, by, next, remediation?, docs }`

| Part | Form | Why |
| --- | --- | --- |
| Causes the error's fields decide | crisp: `docHelp/typedCause.ts` | An authority failure's `reasonCode`, an `agent-tool-failure.v1` kind and retry policy, a VCS code, the eval's `failureKind`, the RPC `errorKind`. Discriminants the platform records are mechanism, not judgment. The error's own remediation is kept exactly. |
| The cause of a plain-text error | its own function, `docHelp/cause.nl` (`readout: decision`, seven causes) | The residue: telling "my arguments are wrong" from "wrong context", "missing grant", "needs approval", "transient" and "platform defect" from a message is the judgment agents keep getting wrong. The definitions are in the instruction, in the `troubleshootGithub/cause` style. |
| Next step | crisp: `docHelp/nextStep.ts` | One step per cause, from the sandbox and capabilities skills (completion rules, "Diagnose a denial"). It never rewrites the call: repairing the arguments stays with the agent. |
| Documentation | `locateDoc` of "`call`: `message`" | The sections that answer the error, quoted exactly. |

## Measurement

See "Status" below.
