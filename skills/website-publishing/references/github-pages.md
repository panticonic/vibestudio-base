# GitHub Pages

GitHub Pages publishes the same package through managed source. Call
`website.githubPagesFiles(site)` and write the returned bytes under `docs/` with
semantic VCS. Commit and use the existing protected Git publication flow. Then
configure and observe Pages with `configureGitHubPagesPublication` from
`@workspace/integrations/github`.

Retain the exact commit and build ID. Pages must serve `/docs` from the reviewed
branch. Repository creation, Git publication, and Pages configuration remain
separate reviewed effects. Verify the public `vibestudio-build.json` before
reporting the site deployed.
