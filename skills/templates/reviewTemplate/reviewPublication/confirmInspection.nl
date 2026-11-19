---
description: Check that the immutable authoring basis and requested publication target are complete.
args:
  request: TemplatePublicationInput
returns: "reinspect" | "include-required-parts" | "request-target" | "ready-to-publish"
---
Compare the current fingerprint with exactly the inspected one. A mismatch requires reinspect. Then require all parts in the author's actual requiredParts list, including local runtime companions. If missing parts are recorded return include-required-parts. Then require the supplied destination and version. Return ready-to-publish only after all prerequisites.
