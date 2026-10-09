# Vercel

Call `website.connectVercelForPublishing(credentials)` when no matching
credential is connected. The Host collects and stores the token with a
`publish` binding for `https://api.vercel.com`.

```ts
const receipt = await website.deployToVercel({
  credentials,
  site,
  operationId,
  project: "my-site",
  teamId,
  environment: "preview",
});
```

The adapter uploads missing content-addressed files and creates a deployment.
Wait for Vercel to report readiness, then verify its public manifest. Use
`production` only when the user selected the production destination.
