# Cloudflare Pages

Call `website.connectCloudflarePagesForPublishing(credentials)` when no matching
credential is connected. The Host collects and stores a Cloudflare API token
with Pages write access and a `publish` binding. The adapter finds or
creates the named Pages project as part of the reviewed publication operation.

```ts
const receipt = await website.deployToCloudflarePages({
  credentials,
  site,
  operationId,
  accountId,
  project,
  branch: "preview-name",
});
```

The Host exchanges the API token for a short-lived Pages upload JWT and keeps
both secrets out of workspace memory. Workspace code checks which hashes are
missing, uploads that content, commits the hash set, and submits the manifest.
Omit `branch` for the production deployment selected by the project.
