# Quiet API integration readiness

The task starts with a user goal and the currently trusted integration
selection. It resolves only named public destinations through the selected
operation. Verified binding metadata does not establish a successful API
call. The model owns selection, prioritization, recovery advice, and the
decision to stage a private local handoff.

| Procedure | Implementation |
| --- | --- |
| Select an exact current integration | Typed Natlang checks the live inventory and retained selection, including role, source, revision and workspace. A copied selection cannot initiate even a quiet credential lookup. |
| Review audiences by transport and lifecycle | Use the installed `api-integrations/reviewIntegration` hierarchy and sealed `bindIntegrationReview` with an injected resolver port. Required destinations determine coverage, optional results remain separate. Stop safely when a lookup cannot verify authorization. |
| Resolve quiet authority | Apply the actual shared URL-bound candidate selector to synthetic records. Use an explicit current `pregranted-only` mode, check the synthetic exact grant coordinates before projecting a lifecycle, and never request a grant, perform egress, read personal credentials or attempt renewal. |
| Review release readiness | Decide between a verified binding-only result, required setup or renewal, a later authorized check, or an explicitly requested local handoff. Keep native provider access unverified. |
| Verify local effects | Compare exact scoped results, stages and current context. Read back and hash the signed artifact. Host accepts only matching complete trajectory references and independently checked plain results. |

## Matching mechanism and consumers

| Consumer | What it does with the shared mechanism |
| --- | --- |
| Host `credentialService.ts` URL lookup | Uses the same audience, transport, label and caller candidate selector. Its loading, refresh, selection errors and credential-use admission remain separate. |
| Host `egressProxy.ts` URL lookups | Uses the selector for agent and direct interactive egress. Its binding-catalog lift, direct versus agent-exchange filter, grant admission, credential injection and outbound transport remain separate. |
| Host `credentialSelection.ts` direct label lookup | Uses the selector and retains its direct-caller-only semantics and unique-label error. The label writing and uniqueness policy is unchanged. |
| `credential-client/urlAudience.ts` and `credentialActor.ts` | Retain canonical URL matching and caller-attribution rules. Native model/provider-ID lookup uses provider identity instead of URL candidate selection. |
| `credential-client/credentialStatus.ts` | Computes secret-free lifecycle facts. The fixture reads those facts from synthetic records without using any refresh token. |
| `serviceDispatcher.ts` pregranted-only Eval admission | Refuses acquisition before opening approval. The standalone fixture exposes an explicit equivalent quiet boundary for its synthetic grants and never invokes the approval queue. It does not attest a production provider grant. |
| Base `api-integrations/workflow.ts` consumer | Retains its normal runtime resolver by default. The new synthetic fixture supplies a scoped resolver and still exercises operation/destination sealing. |
| Natlang teacher, trajectory codec and learner | See only the redacted observation and full content-addressed ValueRefs. They perform no matching and cannot use the synthetic or real credential. |

Source checks run on bounded offline records and private temporary scratch.
Managed environments use the same synthetic fixtures. No external calls,
real credential reads, credential exchange, grant creation or model calls
occur during qualification.

## Installed capabilities and exact checks

| Installed capability | Representative selectors by suffix | Independent proof |
| --- | --- | --- |
| `api-integrations/reviewIntegration` and `bindIntegrationReview` | `api-readiness-optional-miss-continue-scope`, `api-readiness-optional-temperature-grant-stops-required`, `api-readiness-optional-grant-after-required` | Exact sealed plan arguments and required/optional order, redacted lookup returns, held destination IDs and resulting coverage. |
| Credential URL and transport canonical matching | `api-readiness-repo-prefix-boundary`, `api-readiness-exact-query-version`, `api-readiness-origin-http-distinct`, `api-readiness-held-publish-transport-separate` | Production selector and audience projection agree on exact use, origin, segment boundary and distinct query. |
| Credential caller and lifecycle | `api-readiness-other-owners-same-label`, `api-readiness-human-binding-agent-refused`, `api-readiness-refreshable-expiry-quiet`, `api-readiness-held-revoked-archival-binding` | Original synthetic acting member, transport and selected binding; only authorized lifecycle facts leave the fixture. Direct-only egress explicitly still excludes exchange candidates. |
| Eval authority intent and local handoff | `api-readiness-unknown-first-stops-sensitive-remainder`, `api-readiness-held-old-build-grant`, `api-readiness-held-quiet-multi-use-stage` | Native system-test runner sets `pregranted-only` for both modes. Verification checks the redacted synthetic grant observations, strict local artifact bytes and still-unobserved provider access. Actual hosted qualification remains separate. |
