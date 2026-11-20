# Authority preflight workflow

The caller supplies an ordered set of intended operations and an exact
resource ceiling. The runtime binding performs only the existing host dry-run
for those operations. The model receives the assigned operation label and the
host's capability, resource, tier and status for each leaf.

- The root reviews each operation in order and delegates the complete-run
  decision to a separate function.
- Each operation separates host preflight, exact matching against the caller's
  ceiling and interpretation of the host disposition.
- The combined review consolidates only identical protected leaves. Different
  resources stay distinct. A denial or an out-of-scope leaf holds the plan,
  while an otherwise eligible acquisition remains pending.
- Typed RPC, the operation allowlist and receipt construction are TypeScript.
  The workflow has no binding for executing a reviewed operation or requesting
  or consuming authority.

## CLI approval visibility

`reviewApprovalQueues` interprets supplied list or watch receipts.
`selectApprovalSurfaces` identifies the queues the caller can consult.
`reviewApprovalSurface` reduces one queue to its latest authoritative state,
while `summarizeApprovalVisibility` determines what the combined view establishes.
`latestApprovalReceipt` implements the exact reverse lookup in TypeScript.
`locatePendingApproval` attributes the supplied ID to an observed queue.
The caller supplies redacted receipts and retains access to the CLI.
