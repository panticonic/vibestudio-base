---
description: Independently inspect active release identity and one requested rollback history candidate.
args:
  assignment: DossierAssignment
  review: ExtensionReleaseReview
returns: ReleaseHistory
---
Use readHistory with the exact operationId from assignment.request. Return the exact result. A live older build, an unactivated published candidate, and a retained rollback build establish different facts.
