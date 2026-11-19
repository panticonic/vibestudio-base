# API integration readiness in Natlang

| Procedure | Form | Reason |
| --- | --- | --- |
| Match each destination and transport | Scoped host resolver | The host owns audience matching and credential-use authorization. |
| Interpret the selected lifecycle | `reviewAudience` and `interpretBinding` | A canonical miss, an inaccessible result, and an observed lifecycle require different next steps. |
| Combine the required and optional destinations | `summarizeCoverage` | A partial integration can support some operations. Its required destinations determine readiness. |
| Describe recovery | `reviewIntegration` | The workflow can ask for public setup facts or advise retrying after authorization. The caller retains the account setup and HTTP effect capabilities. |

The TypeScript adapter seals the request coordinates. Model-visible results contain
only outcome, lifecycle, refreshability, and local receipts. Callers that need
quiet behavior run under their existing pregranted-only authority policy.
