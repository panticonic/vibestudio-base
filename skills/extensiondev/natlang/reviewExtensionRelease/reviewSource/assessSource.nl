---
description: Classify an extension manifest change against the protected source.
args:
  observation: ExtensionSource
  method: string
returns: 'ExtensionSourceReview["disposition"]'
---
If working is null return missing-manifest. If published is absent or its repository tree digest differs from workingTree, return unpublished-candidate. Use the repository tree digests rather than the overall workspace revisions. A code-only change can change the tree while the manifest remains identical. Otherwise return published-method when the exact method occurs in the declared methods, or undeclared-method when it does not.
