# Agentic stack change planning

The agentic-development guide's source ownership, coordinated contract changes
and same-context canary policy form one workflow. The caller gives it the
proposed behavior and the exact owned workspace context. A read-only adapter
pins the context's current working head and reads the installed units' source
guides at that head. It returns the context and revision with those observations.

- Source ownership is its own lambda. It chooses the package that should own
  the change and the consumers that need to change with it.
- Ownership and stored-history review are separate child lambdas. The latter
  spells out the replay obligation only for changes to persisted contracts.
- Verification planning uses separate build and canary child lambdas. They
  distinguish focused package tests, rebuilding runnable units, fresh canary
  observation and cleanup.
- Exact revision pinning, the source lookup allowlist and the installed VCS
  calls are TypeScript. The planner issues a plan and neither edits nor claims
  to have verified a change. Execution needs the matching authoring and
  canary services in a subsequent workflow.
