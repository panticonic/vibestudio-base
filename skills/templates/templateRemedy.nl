---
description: Choose what to do about a failed template inspection, fetch, or publication, from its error text.
args:
  error: string
returns: TemplateRemedy
readout: decision
---
Choose the remedy for the template error by the first rule that fits:
1. connect-credential: it asks to connect a credential for a private source.
2. stop-integrity: a snapshot, digest, commit, or manifest failed validation or does not match what was pinned.
3. retry-later: a remote could not be reached or answered (network, DNS, timeout, 5xx while fetching).
4. reinspect-authoring: the workspace changed after authoring was inspected, so the inspection is stale.
5. fix-authoring-dependency: authoring refers to a workspace package or part that is missing.
6. check-publication-outcome: a publication step failed or stopped partway.
7. unrecognized: none of the above.
