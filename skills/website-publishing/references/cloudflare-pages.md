# Cloudflare Pages

Call `website.connectCloudflarePagesForPublishing(credentials)` when no matching
credential is connected. The Host collects and stores a Cloudflare API token
with Pages write access and a `publish` binding. The adapter resolves or creates
the named Pages project inside the reviewed publication operation.

```ts
const receipt = await website.deployToCloudflarePages({
  credentials,
  site,
  operationId,
  accountId,
  project,
  branch: "preview-name",
  saveReceipt: async (value) => {
    scope.publication = value;
  },
});
```

The Host exchanges the API credential for the short lived Pages upload JWT and
keeps both secrets out of workspace memory. Userland checks missing hashes,
uploads content, commits the hash set, and submits the manifest. Omit `branch`
for the production deployment selected by the project.
