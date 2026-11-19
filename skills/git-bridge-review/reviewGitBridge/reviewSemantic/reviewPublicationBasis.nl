---
description: Determine whether protected main contains an exportable repository.
args:
  semantic: GitBridgeSemantic
returns: GitBridgePublicationBasis
---
If mainRepositoryId exists return protected and identify mainEventId as the export basis. If only workingRepositoryId exists return local-only and explain what must be reviewed and published first. If both are missing return missing. Include pending local work when clean is false or relation is ahead or diverged, and explain that it still needs semantic review before it can be included in an export.
