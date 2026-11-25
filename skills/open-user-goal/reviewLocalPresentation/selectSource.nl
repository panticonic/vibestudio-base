---
description: Compare local records to establish exactly which source the goal permits.
args:
  goal: string
returns: PresentationSourceChoice
budget: { maxTurns: 12 }
---
Identify the relevant current record using listRecords and the needed readRecord observations. Compare its actual owner, period, content and status with the user's requested briefing. Read other records when needed to disambiguate or answer an explicit comparison, rather than copying unrelated or archived facts into the chosen record.

The native previewAllowed field establishes whether that owned record may be previewed. Apply additional approval or provenance conditions only when the user actually requests them or the native record declares them as prerequisites. An absent approval label alone does not override an explicit preview grant. A request to incorporate changes made while working is not evidence that an opening record is unavailable just because the later correction is not in that first observation; retain the actual initial revision and respond to subsequent native revision/readback evidence. Do not fabricate corrections or facts that have not been observed.

Return the single matching permitted current record, or a held result explaining actual ambiguity, missing requested evidence or denied native preview authority.
