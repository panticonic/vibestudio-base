# Authoring a workspace snapshot

List protected-main repositories with `authoringParts`. Pass the selected
repositories, a name, and a description to `inspectAuthoring`. Inspection
reads template dependencies from `meta/vibestudio.yml`, leaves out
repositories those dependencies provide, adds locally owned workspace-package
dependencies and referenced runtime units, and returns a manifest and a
fingerprint.

```js
const templates = "@workspace-extensions/templates";
const inspection = await extensions.invoke(templates, "inspectAuthoring", [
  {
    name: "News",
    description: "A focused news workspace",
    parts: ["panels/news", "workers/news"],
  },
]);
```

Select only the repositories that match what was asked for; `authoringParts`
is an inventory, not a request to include the whole workspace. Match the
requested source by repository kind and package identity: a reusable library
is a package, while an extension provides a workspace capability. Don't
substitute an extension that calls a library for the library itself.
Inspection adds the required dependencies automatically.

Keep the inspection in `scope` and return a compact review with its
fingerprint, main event, manifest, and requested/required/included parts. If
the review is larger than eval's return limit, read the retained value in
pages before saying the plan is ready; a truncated preview is not the full
plan.

Review `requestedParts`, `requiredParts`, and `includedParts`, then publish
that plan unchanged:

```js
const request = {
  commandId: crypto.randomUUID(),
  intent: inspection.request,
  expectedFingerprint: inspection.fingerprint,
  version: "1.0.0",
  destination: {
    provider: "github",
    owner: "example",
    name: "news-workspace",
  },
  creation: { private: true },
  credentialId: "explicit-connected-account",
};
const review = await extensions.invoke(templates, "reviewPublication", [
  request,
]);
// Show added, changed and removed files. Fetch oldHash/newHash blobs only when
// needed for drill-down. Get the user's approval of this exact release.
const publication = await extensions.invoke(templates, "publishAuthoring", [
  {
    ...request,
    expectedRemoteCommit: review.remoteCommit,
  },
]);
```

The snapshot carries the runtime configuration of the selected parts,
including provider and trust declarations for included units. A new workspace
created from it still starts with no inherited grants or credentials.
Dependency declarations live in the workspace manifest and are kept
automatically. Don't add dependencies, composition disables, workspace
identity, concrete secrets, or author identity to the publication request.

Use `authoringSetup` to prefill the current template's name, description,
upstream, and authored parts. For an existing upstream, omit `creation`; this
needs contents write access, not repository administration. Review checks
account access and returns the actual diff against the upstream; publishing
is rejected if the upstream or local source changed since. Don't use per-unit
`git.pushUpstream` to publish a whole template. `git.upstreamStatus([])`
reports separately declared per-unit Git upstreams, not the workspace's
template publishing destination.
