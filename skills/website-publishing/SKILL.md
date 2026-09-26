---
name: website-publishing
description: Package and publish a panel as a static website to Vercel, Cloudflare Pages, or GitHub Pages.
onboarding:
  capabilities:
    - id: capability.website-publishing
      title: Publish websites
      summary: Package a panel and deploy it to Vercel, Cloudflare Pages, or GitHub Pages.
      category: ready-now
      role: ready-capability
      scope: workspace
      tier: direct
      visibility: primary
      actions:
        explore:
          via: owner-skill
    - id: connection.vercel-publishing
      title: Vercel
      summary: Connect an account for host-mediated website publishing to Vercel.
      category: connections
      role: connection
      scope: user-workspace
      tier: direct
      visibility: secondary
      actions:
        setup:
          via: owner-skill
        repair:
          via: owner-skill
        reconnect:
          via: owner-skill
        change:
          via: owner-skill
        inspect:
          via: about-page
          page: credentials
        revoke:
          via: about-page
          page: credentials
        grants:
          via: about-page
          page: permissions
      setup:
        successDescription: A host-held Vercel publishing credential is connected.
        status:
          kind: credential-connection
          providerId: vercel
    - id: connection.cloudflare-pages
      title: Cloudflare Pages
      summary: Connect an account for host-mediated website publishing to Cloudflare Pages.
      category: connections
      role: connection
      scope: user-workspace
      tier: direct
      visibility: secondary
      actions:
        setup:
          via: owner-skill
        repair:
          via: owner-skill
        reconnect:
          via: owner-skill
        change:
          via: owner-skill
        inspect:
          via: about-page
          page: credentials
        revoke:
          via: about-page
          page: credentials
        grants:
          via: about-page
          page: permissions
      setup:
        successDescription: A host-held Cloudflare Pages publishing credential is connected.
        status:
          kind: credential-connection
          providerId: cloudflare-pages
---

# Website publishing

Publish from the exact workspace state the user reviewed. Packaging and provider
protocols run in workspace code; the Host compiles immutable artifacts, stores
credentials, mediates HTTP, and reviews the sealed publication intent.

## Onboarding routes

The installed skill contributes the ready **Publish websites** capability and
the optional Vercel and Cloudflare Pages connection rows to onboarding. Follow
the typed target returned by onboarding:

- For `connection.vercel-publishing`, render
  `skills/website-publishing/PublishingSetup.tsx` once with
  `{ provider: "vercel" }`.
- For `connection.cloudflare-pages`, render the same component once with
  `{ provider: "cloudflare-pages" }`.
- For `capability.website-publishing`, help choose or author the panel first,
  then choose a destination and continue with the happy path below. A provider
  connection is optional preparation, not a prerequisite for authoring.
- GitHub is one shared connection. Route setup through
  `skills/github/GitHubSetup.tsx` with `{ accessLevel: "publish-pages" }`; do
  not create a second GitHub Pages credential row.

The setup components open the provider's own token page and send the secret
straight to the Host credential dialog. Never ask the user to paste a token in
chat or inline UI state. After a successful connection, render the onboarding
overview again so its owner observation refreshes.

## Happy path

1. Read [authoring](references/authoring.md), then ensure the panel declares
   `vibestudio.website.entry`. Reuse the application component and add a small
   browser mount entry. `expects` and `suggestedTemplates` are guidance for an
   agent. Treat dependency ranges and template locators as suggestions. Inspect
   the current workspace, repair what is actually present, and record exact
   hashes only in build and publication receipts.
2. Commit the source and use its exact `ctx:` or `state:` reference.
3. Import `{ credentials, rpc }` from `@workspace/runtime` and `website` from
   `@workspace/integrations`, then call `website.packageWebsite(rpc, unit,
   exactRef)`. Review the complete returned
   public file inventory. The public `vibestudio-build.json` contains content
   identity and no workspace state, source path, credentials, or transcript.
4. Choose one provider reference below. Generate one durable `operationId` and
   retain the initial input plus every receipt in `scope` before awaiting the
   next external step. Reuse the same ID after uncertain failures.
5. Let the Host collect or connect credentials. Never ask for a token in chat,
   read one from files, put one in eval state, or call provider APIs outside
   `credentials.publishFetch`.
6. After submission, observe the returned deployment. Call
   `verifyPublishedWebsite(receipt)` only when the provider reports it ready;
   it verifies that the public manifest matches the reviewed artifact digest.

## Providers

- [Vercel](references/vercel.md)
- [Cloudflare Pages](references/cloudflare-pages.md)
- [GitHub Pages](references/github-pages.md)

Provider project and account choices are userland facts. Ask for them only when
they cannot be inferred from a retained receipt or the connected account.
Preview is the default for Vercel and branch deployments. Production promotion
uses a new reviewed operation and the same immutable artifact.

## Recovery

Receipts move through `prepared`, `uploading`, `submitted`, and `deployed`.
`submitted` means the provider accepted a deployment, not that the public URL is
ready. After a timeout, inspect or verify the retained deployment ID before
creating anything. A changed artifact, destination, environment, or provider
requires a new operation ID. Safe content uploads are content addressed and may
be repeated with the original ID.

The Host may reject a target outside the caller supplied audience even if the
stored credential is broader. Do not widen that audience to make a failing
request pass; correct the provider adapter or destination.
