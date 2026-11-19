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
| Search focus | its own function, `docHelp/keywords.nl` | Identify the requested action and object, excluding incidental timing/sequence/quantity context. Choose focused retrieval words or phrases, preserving named identifiers and using relevant synonyms when helpful. This is semantic policy; equal keyword weights cannot decide which part of a question is its intent. |
| Search interface | crisp: `docHelp/searchTerms.ts` | Trim and deduplicate typed queries, add lexical atoms alongside original phrases, require a nonempty query set, and escape regex metacharacters. Retrieval vocabulary is unconstrained: query terms are search requests, not answer claims. |
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
- `docHelp/keywords.nl` chooses retrieval queries; `searchTerms.ts` normalizes strings and escapes regex syntax; `sections.ts` preserves source slices; `rank.ts` performs
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

The first postfix Luna run (`docs-b`) confirmed recall alone is insufficient: its 39 fit decisions rejected the
first lexical publication/context passages and exhausted the existing 40-call collection allowance before the
actual typecheck section. This is a retrieval-policy defect, not a reason to increase the allowance. `keywords.nl`
now identifies the question's actual requested operation and object before exact BM25 ranking. It receives no
catalog, source labels, expected answer or invented API names. A separate semantic selection is necessary because
contextual words can be rarer than the operation itself. The final docs-f pilot qualifies the corrected path below.

Production directory entries are relative to the listed directory (`fsDisk.ts:relativeDirentName`), even for
recursive listings. Prefix that scope before `readText`; the fixture returns the same relative names, and a
scoped truncated-search regression checks this boundary. Root listings naturally need no prefix.

The canonical service-schema description also incorrectly called recursive names context-root-relative.
Inventory: `packages/service-schemas/src/fs.ts` has the `dirent.name` and `readdirOptions.recursive`
descriptions; the established generator renders both into Base
`packages/natlang-services/src/serviceDeclarations.generated.ts`. Exact-phrase searches across all configured
template and host sources found no other copies. Correct both schema descriptions and regenerate the Base
consumer with `scripts/generate-natlang-service-declarations.mjs`; runtime `fsDisk.ts:239,663` already has the
correct listed-directory-relative behavior and is unchanged. The scoped fixture regression exercises it.

The next genuine run (`docs-c`) reached quality one and exact replay, but admission correctly rejected its
recovered failed action. The semantic selector had returned a valid phrase from the question; validation
accepted only single tokens. The general correction removes question-membership validation entirely. Search
queries may use phrases, reordered concepts, technical vocabulary or synonyms absent from the question.
Their relevance belongs to `keywords.nl`; `fits.nl`, source authentication and semantic review judge the result.
`searchTerms.ts` only trims/deduplicates nonempty strings and escapes regex syntax. The obsolete tokenizer and
vocabulary guard are removed. Tests cover a useful inferred synonym and the observed multiword query.

Two clean-source samples returned ordinary multiword search requests that had no exact whole-phrase corpus
match. The remaining mechanism mismatch was in crisp query processing: `docs.search` tokenizes requests,
while filesystem retrieval and BM25 used only entire phrase substrings. Normalize one shared query set into
lexical atoms (preserving compound identifiers) plus original phrases for exact-match relevance. Both filesystem
retrieval and ranking consume it; the catalog receives the same set and applies its own public index. This is
standard lexical indexing, without semantic stopword selection, vocabulary restrictions, or a larger candidate cap.
The regression replays the observed multiword requests against the original document world.

## Qualified canonical teacher pilot (2026-11-17)

`docs-f` passed from Base `e24dd517acd34dc65f90268557e1e76ec34e3e73`, host
`e710ef5e1815995f5a4b225fa06be70a3cf1477c`, and Natlang
`67a3eb6935c69db259c3219963f311fb14268e83`, all clean. The actual `docHelp.nl` root called
`keywords.nl` once and the finite `fits.nl` decision readout twelve times: fourteen captured Luna calls,
one root and thirteen children, with zero failed tool actions. The suite scored quality one. All source,
entry and root binding checks passed; no invented inline workflow replaced the authored source.

The returned answering quote is the actual `@workspace-extensions/typecheck-service.checkPanel` passage in
`skills/workspace-dev/TOOLS.md`. Exact replay verified all fourteen model requests. The separate semantic
review accepted its actionable typecheck guidance and its distinction from the broader build report.
`natlang.teacher-admission/1` admitted one sample, rejected none; the review is evidence, not a training target.
The native decision replies are real sampled teacher outputs, not copied reference labels or invented scores.

Evidence: `/home/werg/data/vibestudio-teacher-pilot-20261117/docs-f/admissions/t000000.json` and its bound
ordinary canonical teacher pool under `docs-f/teacher`. The owned ledger unit
`vibe-doc-querywords-luna-20261117` joined successfully (about 2 GB peak). The final source also passed
26 host fixture/IR tests, ten Base helper tests, and all 34 case preflights/IR exports. The full reviewed inventory
now contains 39 authored `.nl` sources across 18 suites and 450 cases.

Earlier diagnostics stay excluded: the initial `docs` run missed the answer; `docs-b` exhausted forty model
calls; `docs-c` recovered a failed action and was rejected despite a final correct answer; `docs-d` and `docs-e`
returned no matches before query-word indexing was fixed (`docs-d` also introduced an inline self-delegation).
Sources changed during this development sequence, so it is not an unbiased acceptance-rate estimate.
Qualification proves this canonical collection/admission path, not generalization to fresh documentation worlds.

The post-merge whole-System typecheck exposed a separate stale ambient boundary:
`skills/sandbox/help/services.d.ts` still described the former maxBytes-only read and omitted readdir.
Inventory of all Base/System `natlang:services` ambient declarations found this is the sole filesystem copy;
other skill declarations describe web, local models or logs. The generated service reference already had the
correct complete contracts. Update the self-contained ambient subset to those same readText paging and
readdir signatures; no external host type import enters portable model files. Original evaluator/native
preflight inject actual service types and therefore did not exercise this standalone workspace declaration.
The full System composition check, not another runtime pilot, verifies this typing-only correction.
