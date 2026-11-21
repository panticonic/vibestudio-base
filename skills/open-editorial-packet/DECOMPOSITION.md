# Local publication candidate from approved mission evidence

| Existing consumer or mechanism | How it contributes |
| --- | --- |
| Personal Mission Control store, its fixture worker, and `skills/open-personal-goal` | Seed the team's actual scoped mission card and an obsolete lookalike. Read identity, revision and approved source grant from the native store. A card change revokes an earlier action even if the text remains plausible. |
| Base `skills/pdf-intake/extractPdfEvidence` and `pdf-intake-bindings` | Read the assigned local attachment through the real bundled PDF extractor. Keep document digest, verified page boundary, and exact line citations. No OCR, remote fetch, or checking inaccessible pages. |
| Base `skills/open-user-goal/runUserGoal/reviseWorkspaceDocument` | Its existing choose and reconcile lambdas make the narrow proposed edit and reconsider it when the exact workspace revision changes. Preserve independently added text. Abstain when the owner changed the same claim or when refreshed evidence no longer supports it. |
| Semantic VCS `edit` and native readback | All writes target one private working file at the observed semantic head and stable file ID. Read the resulting revision independently. No commit, deploy, public output or workspace-wide mutation endpoint is exposed to the program. |
| Scratch handoff and Host IR verifier | Stage one authorized private readback packet with exact PDF lines and final candidate revision. Bind full ValueRefs to plain independently observed witnesses. Existing IR, per-call export, and training consumers continue unchanged. |

1. A child discovers the bound mission and its intended candidate. The current card gives the source approval; a prior draft or exported preview is supporting context only.
2. A child chooses the exact PDF, allowed pages and evidence query. The installed PDF subtree extracts actual lines. An exact binding confirms that any reported citation truly came from those bytes and the current policy.
3. The installed revision subtree proposes a minimal change. After a stale compare-and-set response, a bounded typed child obtains the latest working text and fresh approved citations, then asks the installed reconciler whether the change still applies. One authorized retry preserves unrelated coedits. A same-field disagreement or revoked scope blocks the write.
4. A typed synthesis decides whether the result is ready for review, already current, review-only, or held. When the goal requests a local handoff it contains the actual stored revision and original evidence. The independent verifier reopens both while protecting the source, mission and committed workspace heads.

The source fixtures create original small text PDFs and authored retained preview receipts representing approvals or history. Preview text is not a browser capture. Source replay uses local PDF extraction and a file-backed semantic workspace adapter. Managed bindings use the real Personal mission store, PDF extension, semantic VCS, and native scratch in disposable owned contexts.
