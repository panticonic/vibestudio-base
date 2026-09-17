# Authoring a workspace snapshot

List protected-main repositories with `authoringParts`. Pass the selected
repositories to `inspectAuthoring` with a name and description. The inspection
reads template dependencies from `meta/vibestudio.yml`, excludes repositories
they provide, adds locally owned workspace-package dependencies and referenced
runtime units, then returns a manifest and fingerprint.

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

Review `requestedParts`, `requiredParts`, and `includedParts`. Publish only
that unchanged plan:

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
// needed for drill-down. Obtain the user’s approval of this exact release.
const publication = await extensions.invoke(templates, "publishAuthoring", [
  {
    ...request,
    expectedRemoteCommit: review.remoteCommit,
  },
]);
```

The snapshot owns its selected runtime configuration, including provider and
trust declarations that refer to included units. A fresh workspace still starts
without inherited grants or credentials. Dependency declarations belong in the
workspace manifest and are retained automatically; never add a second dependency
channel, composition disables, workspace identity, concrete secrets, or author
identity to the publication request.

Use `authoringSetup` to prefill the current template’s name, description, upstream,
and authored parts. For an existing upstream omit `creation`; it requires contents
write access, not repository administration. Review validates account access and
returns the actual upstream diff; publishing rejects changed upstream or local
source. Do not use per-unit `git.pushUpstream` to publish a complete template.
`git.upstreamStatus([])` inspects separately declared per-unit Git upstreams;
it does not inspect the workspace’s template publishing destination.
