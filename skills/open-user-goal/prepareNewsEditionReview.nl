---
description: Prepare a private visual editorial packet from the exact current retained News edition.
args:
  goal: string
returns: NewsEditionReviewResult
uses: [reviewNewsEvidence]
budget: { maxTurns: 26 }
---
1. Call newsEditionReview.readDesk to get the local editor brief for this audience.
2. Form a read-only editorial evidence question using the original goal and the desk brief. Call reviewNewsEvidence for the assigned topic and reader. Leave its private evidence-note handoff null because this outer task owns the review packet.
3. Call reviewBriefing before designing anything. Ask choosePacket with the goal, desk brief and exact News evidence. A blocked reader, unsupported claim, superseded desk authority or request for a public effect means hold. Call attributeBasis and retain its exact result. Return the actual plan findings and attribution with null artifact for a hold or a requested review-only answer.
4. For an authorized packet with a verified briefing, call designEditorPacket, then pass those exact results to newsEditionReview.stage. Return the actual plan findings, attribution and private artifact receipt. Keep source article IDs and revision; no publication, reader edits or live cadence changes.
