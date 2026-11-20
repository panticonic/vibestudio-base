# Publish a reviewed website to an owned preview destination

| Part | Implementation |
| --- | --- |
| Discover the actual launch record and package | The scoped service observes the current renderer and immutable website package, then returns the actual destinations, review retention, and package identity. |
| Select the owner's intended destination | A typed Natlang child chooses the route from the full user goal and observations. The binder compares destination, environment, reviewed artifact and visible labels before allowing any publication. |
| Upload, submit, and retry | The installed website integration executes the Vercel protocol against a private transport that writes and rereads owned files. The existing Host credential API opens and records one exact operation in its real journal. The native journal determines which steps to skip on a retry. The transport only accepts the assigned preview destination and never calls external egress. |
| Recover or verify an existing operation | A typed Natlang child decides whether to resume an unfinished operation or refresh readback. The integration's normal verification function reads the original preview manifest through the private transport. |
| Verify or hold | The managed verifier independently reopens the retained package, hosted file bytes, and native journal receipt. It checks exact phase progress, duplicate prevention, authorized scope, and absence of side effects for a hold. |
