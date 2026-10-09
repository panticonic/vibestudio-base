# Checks, publication, and activation

## Build the current context

A build is derived from source state, not a second history. Call the build
service with the context ref (`ctx:<contextId>`) and the smallest relevant
unit or package, read its structured esbuild, TypeScript, and authority
diagnostics, and fix the cited files with normal local edits. In eval, call
`await services.build.getBuildReport(unit, "ctx:" + contextId)`; other
clients should look up the live `build.getBuildReport` schema.

Don't create semantic IDs from build keys or content digests. After a fix,
build the new context state again and keep using `vcs.status` for
orientation. The local check grants nothing, but it is the fastest way to see
the diagnostics the publication gate will enforce.

## Publish through VCS

`vcs.push` is the only way to publish to protected refs. It takes a clean
committed event and the main event observed by `status`, validates ancestry
and integration completeness, runs the candidate build/typecheck/authority
gate for changed units and their transitive dependents, obtains approval, and
advances the protected refs atomically through a durable effect.

Runtime code calls `vcs.publish({ message? })` instead of assembling that
sequence. It reads status once, commits the uncommitted chain when there is
one, and pushes the committed event against the observed main, with the same
gate and approval. If main is not an ancestor of the context, it returns
`{ code: "IntegrationRequired", mainRelation, compare }` and changes nothing;
it never merges. The agent tool's `push` returns the same result.

Publication protects semantic history as well as bytes: even if no repository
byte changed, the approval names the previous and new semantic events and the
main advance. Replaying an already-applied publication doesn't prompt again; a
generic retry or host operation can't obtain publication authority.

Publication creates no source event. A build/typecheck, ancestry,
integration, authorization, approval, or atomic-ref failure advances no
protected ref. Handle refusals by code:

- On `IntegrationRequired`, review the returned `compare`, merge from the
  newly observed main, commit, and publish again.
- On `IntegrationIncomplete`, run the returned `allRemaining` recipe before
  retrying commit or publication.
- Stop when authorization or approval is required.
- Keep integrity and host-effect diagnostics intact.
- On a build or typecheck refusal, read every diagnostic, fix the source,
  rerun the context report, commit, and push the new event.

## Builds after publication

Build subscribers may react to the new `main` and produce derived,
content-addressed artifacts. Their success or failure never rewrites or rolls
back the semantic event or protected refs; inspect them with unit diagnostics
and server logs.

Activation fails closed: a failed build, validation, or startup never becomes
runnable, and the last known-good artifact stays selected. Fix the source in a
new local application, run a context check, commit, and publish. Unit logs,
panel consoles, and screenshots help debug runtime behavior but don't replace
semantic `status`, `history`, or provenance inspection.
