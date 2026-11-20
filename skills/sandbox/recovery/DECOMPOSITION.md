# Eval recovery

The program reviews one completed EvalDO attempt and one assigned blob-text
operation. It returns evidence for continuing, checking the effect, or
reviewing the original attempt.

| Procedure | Implementation |
| --- | --- |
| Select the exact eval attempt and expected effect | The caller seals the run identifier, digest, size, native journal and readback authority. |
| Interpret an EvalDO result independently of the effect | The TypeScript binding projects validated receipt coordinates. `inspectJournal/compareReceipts` assesses only the exact native receipts against that assignment. |
| Verify the effect | `verifyEffect` requests readback only after an exact native receipt and when the caller permits it. TypeScript reads only the assigned digest and checks the returned bytes. |
| Handle missing or truncated evidence | `chooseRecovery` distinguishes absent operations, missing evidence and inconsistent readback. |
| Recover without duplicating a mutation | The returned recommendation retains the attempted operation and evidence. The binding provides receipt inspection and optional readback. |

The journal assessment keeps contradictions and incompleteness distinct.
Duplicate or contradictory retained stores establish an integrity question.
A truncated record with a single exact receipt or no receipt still requires
journal recovery. The readback service requires a complete, unique match.
