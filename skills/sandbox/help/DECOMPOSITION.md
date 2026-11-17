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

The canonical IR's document world snapshots public workspace Markdown and the capability catalog, excluding
`DECOMPOSITION.md` and generated evaluation-result directories. Those files contain case feedback rather than
user documentation and must not expose protected evaluation inputs to a training case. The ordinary `EVAL.md`
API reference remains searchable. The live suite fixture uses the same exclusion, so serialized worlds preserve
the actual source behavior rather than silently changing it during export.

## `locateDoc(question, scope?): { found, tried }`

| Part | Form | Why |
| --- | --- | --- |
| Search terms | crisp: `docHelp/keywords.ts` | Identifiers (`launch_automation`, `vcs.commit`, `WORKSPACE_RPC_METHOD_UNDECLARED`) first, then content words; at most eight. |
| Candidate files | crisp, in `locateDoc.ts` | Grep is a fast path, never a completeness oracle when truncated. On truncation enumerate Markdown paths with `fs.readdir`; read the selected finite source set with paged `fs.readText`. No fixed file cutoff. Scope paths remain authoritative. |
| Candidate sections | crisp: `docHelp/sections.ts` and `rank.ts` | Split by heading, preserve every exact text slice, then rank by query-term inverse document frequency and length-normalized frequency (BM25). Common words cannot tie all files simply because they occur once. Numerical ranking is search mechanism, not semantic answer selection. |
| Catalog entries | crisp | `docs.search` supplies the service's default ranked result set; `docs.describe` supplies their real descriptions. The production catalog's own lexical index remains unchanged; the fixture preserves its recorded public search surface rather than becoming a second documentation policy. |
| Does a section answer the question | its own function, `docHelp/fits.nl` (`readout: decision`, `answers \| related \| no`) | Judge successive batches of the finite ranked candidate list until a batch supplies an answer or the list is exhausted. The batch size only bounds concurrent calls; it never silently discards unjudged candidates. |
| Result | crisp | The `answers` first, then `related`, three at most, quoted byte-exact with their path and heading. No synthesis step. |

## Retrieval mechanism inventory and pilot correction (2026-11-17)

The live Luna pilot exposed two recall defects: the broad OR query produced 1,631 matching lines in the original
Base document world, beyond the grep service's 1,000-line result bound; later workspace-dev paths disappeared.
Equal distinct-term ranking then permanently limited five files and six sections, even after all six semantic
judgments rejected them. Search order became answer policy. The correction above removes these silent exclusions,
retains exact service bounds through paging/fallback, and keeps semantic selection in the existing `fits.nl`.

Consumers inventoried before implementation:

- `docHelp/locateDoc.ts` is the one retrieval implementation, called both by `docHelp.nl` and
  `recoverFromFailure.ts`. Both receive the same fix.
- `docHelp/keywords.ts` extracts literal query terms; `sections.ts` preserves source slices; `rank.ts` performs
  exact numerical ranking. No supplied expected answer, source path or case label enters any of them.
- `suite.ts` supplies recorded filesystem/catalog services and independent quote grounding. It must implement
  the real `fs.readdir` and paged `fs.readText` shapes; quality expectations remain unchanged.
- The canonical IR serializer includes authored helper files and the source-world Markdown snapshot, so both
  source execution and portable teacher execution receive the identical retrieval logic.
- Production `docsService.ts` delegates to `catalog/catalogIndex.ts` (weighted name/body token overlap, capped
  public result set); `fs` service schemas bound grep output and expose recursive readdir and readText continuation.
  These service mechanisms do not select answer sections and need no policy fork.
- Other templates do not implement docHelp retrieval. Host fixture tests and the Base focused tests cover the
  service boundary and lexical recall; a genuine Luna rerun qualifies the semantic path.

## `recoverFromFailure(failure): { cause, by, next, remediation?, docs }`

| Part | Form | Why |
| --- | --- | --- |
| Causes the error's fields decide | crisp: `docHelp/typedCause.ts` | An authority failure's `reasonCode`, an `agent-tool-failure.v1` kind and retry policy, a VCS code, the eval's `failureKind`, the RPC `errorKind`. Discriminants the platform records are mechanism, not judgment. The error's own remediation is kept exactly. |
| The cause of a plain-text error | its own function, `docHelp/cause.nl` (`readout: decision`, seven causes) | The residue: telling "my arguments are wrong" from "wrong context", "missing grant", "needs approval", "transient" and "platform defect" from a message is the judgment agents keep getting wrong. The definitions are in the instruction, in the `troubleshootGithub/cause` style. |
| Next step | crisp: `docHelp/nextStep.ts` | One step per cause, from the sandbox and capabilities skills (completion rules, "Diagnose a denial"). It never rewrites the call: repairing the arguments stays with the agent. |
| Documentation | `locateDoc` of "`call`: `message`" | The sections that answer the error, quoted exactly. |

## Measurement

See "Status" below.

Validation: the original 1,631-line query now reaches the exact `checkPanel` passage in
`skills/workspace-dev/TOOLS.md`; scripted semantic labels test retrieval mechanics only, not teacher quality.
Nine Base helper tests and 22 host fixture/IR tests pass. The existing evaluator preflight compiles all 34 cases
and exports 34 canonical IR records. Catalog snapshot search follows production compound-token splitting,
name weight three/body weight one, lexical tie-breaking and the public default/cap; snapshot entries do not
contain the production authority/member metadata, so that extra index information remains outside this recorded world.
A source whitelist remains an authored partial oracle: an unexpected but actually sufficient source must be
reviewed as a possible false negative, never silently treated as proof of a bad answer.
