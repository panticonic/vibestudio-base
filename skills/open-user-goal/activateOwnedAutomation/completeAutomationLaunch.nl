---
description: Issue a scoped launch if authorized, then independently read the new native schedule.
args:
  review: AutomationLaunchReview
returns: {activation:AutomationActivation|null;readback:AutomationLaunchReadback}
---
Return null activation and readback when the decision was hold or no launch plan exists. Otherwise call submitOwnedLaunch with the exact review. If activation includes an exact receipt, call readActivatedSchedule with that receipt. Keep both actual results. A moved authorization needs fresh review.
