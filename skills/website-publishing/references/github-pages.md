# GitHub Pages

GitHub Pages publishes the same package through the managed Git repository.
Call `website.githubPagesFiles(site)` and write the returned bytes under `docs/`
with semantic VCS. Commit, then publish through the protected Git publication
flow. Then configure and observe Pages with `configureGitHubPagesPublication`
from `@workspace/integrations/github`.

Save the commit and build ID. Pages must serve `/docs` from the reviewed branch.
Repository creation, Git publication, and Pages configuration are each reviewed
separately. Verify the public `vibestudio-build.json` before
reporting the site deployed.
