# Public evidence research

The public research root decides which sources to pursue and when the question is covered. Search is one discovery tool, not an authorization prerequisite for reading an ordinary public page. A remembered URL remains a hypothesis until the fetched page supports the claim. No task-specific authority names, quotations or expected answers are supplied to the candidate.

| Responsibility | Owner |
| --- | --- |
| Choose search, direct authority reading, or a different route after failure | researchBrief.nl and discoverSources.nl |
| Preserve an explicit caller-supplied source scope | researchBrief.nl and discoverSources.nl |
| Fetch a bounded batch, continue cached pages, expose failures | gather.ts |
| Find what a page passage establishes | findEvidence.nl |
| Check exact quote membership and citation references | verify.ts |
| Synthesize supported claims | writeBrief.nl |
| Combine checked batches without retyping citations | combineBriefs.ts |
| Query providers and fail over within observed credential audiences | shared web-core search/provider mechanism |
| Verify task outcomes independently from actual fetched evidence | System Testing public-research oracle |

The standard web runtime and agent web_search share web-core. Query failures remain separate, owner cancellation propagates, and a wholly failed provider batch can try another credential-authorized provider. Explicit source assignments remain within their supplied URLs. Provider blocks are not bypassed: ordinary public evidence can be read from a different source.

Earlier training captures retain their original program revisions. This source changes how new invocations investigate evidence; it does not rewrite old traces or substitute expected answers.


`gather` receives explicit selected URLs and never searches implicitly. A failed candidate does not consume a successful-page slot; later candidates can still supply evidence. Candidates left beyond the bounded batch are reported, so the semantic root can choose a next batch rather than silently losing them.
