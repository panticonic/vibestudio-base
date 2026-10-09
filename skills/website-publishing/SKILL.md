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

Publish the workspace state the user reviewed, identified by a fixed reference.
Packaging and provider protocols run in workspace code. The Host compiles
immutable artifacts, stores credentials, sends the HTTP requests, and reviews
the sealed publication request.

## Onboarding routes

This skill adds the **Publish websites** capability and optional Vercel and
Cloudflare Pages connection rows to onboarding. Act on the target that
onboarding returns:

- For `connection.vercel-publishing`, render
  `skills/website-publishing/PublishingSetup.tsx` once with
  `{ provider: "vercel" }`.
- For `connection.cloudflare-pages`, render the same component once with
  `{ provider: "cloudflare-pages" }`.
- For `capability.website-publishing`, help choose or write the panel first,
  then choose a destination and follow the happy path below. Authoring does not
  require a provider connection.
- GitHub uses the single shared GitHub connection. Set it up through
  `skills/github/GitHubSetup.tsx` with `{ accessLevel: "publish-pages" }`; do
  not create a separate GitHub Pages credential row.

The setup components open the provider's token page and send the secret
directly to the Host credential dialog. Never ask the user to paste a token in
chat or inline UI state. After a successful connection, render the onboarding
overview again so it shows the new connection status.

## Happy path

1. Read [authoring](references/authoring.md), then make sure the panel
   declares `vibestudio.website.entry`. Reuse the application component and add
   a small browser mount entry. `expects`, `suggestedTemplates`, dependency
   ranges, and template locators are suggestions for the agent. Inspect the
   current workspace and fix what is there. Record exact hashes only in build
   and publication receipts.
2. Commit the source and use its `ctx:` or `state:` reference.
3. Import `{ credentials, rpc }` from `@workspace/runtime` and `website` from
   `@workspace/integrations`, then call `website.packageWebsite(rpc, unit,
exactRef)`. Review the full list of public files it returns. The public
   `vibestudio-build.json` identifies the content and contains no workspace
   state, source paths, credentials, or transcript.
4. Pick a provider reference below and generate one `operationId` for this
   artifact and destination. The Host journals the operation: if a call fails
   or its result is lost, call the same deploy function again with the same
   ID and it resumes from the last completed phase.
5. Let the Host collect or connect credentials. Never ask for a token in chat,
   read one from files, put one in eval state, or call provider APIs except
   through `credentials.publishFetch`.
6. After submission, watch the returned deployment. Call
   `verifyPublishedWebsite(receipt)` only once the provider reports it ready; it
   checks that the public manifest matches the reviewed artifact digest.

## Providers

- [Vercel](references/vercel.md)
- [Cloudflare Pages](references/cloudflare-pages.md)
- [GitHub Pages](references/github-pages.md)

The provider project and account are chosen in the workspace. Ask the user only
when you cannot infer them from the workspace or the connected account.
Vercel and branch deployments default to preview. Promoting to production is a
new reviewed operation on the same immutable artifact.

## Recovery

The Host journal records each operation's completed phase: `prepared`,
`destination-ready`, `uploaded`, then `submitted`. Calling the deploy function
again with the same `operationId` resumes after the last recorded phase, and a
submitted operation returns its receipt without contacting the provider.
`submitted` means the provider accepted a deployment; the public URL may not
be ready yet, so verify its deployment ID before creating anything new. The
operation ID stays bound to its artifact, destination, environment, and
provider; a different one fails with `WEBSITE_PUBLICATION_INTENT_CONFLICT`
and needs a new ID. `verifyPublishedWebsite` adds `verifiedAt` once the public
manifest matches.

The Host may reject a target outside the audience the caller supplied, even if
the stored credential allows more. Do not widen the audience to make a failing
request pass; fix the provider adapter or the destination.
