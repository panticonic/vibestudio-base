# Completed model exchange durability

A model response is captured before the runtime executes the next semantic step. Capture-enabled runs acknowledge a completed exchange only after the records worker commits it. Ordinary uncaptured runs retain their existing store behavior; disabling capture is the explicit opt-out.

Mechanism inventory:
- `src/modelTurnCapture.ts` wraps generation AND decision scoring; `src/driver.ts:113` uses that wrapper for all configured serving backends. `models.ts:123` forwards the same callback, and `evalNatlang.ts:72` binds the records store. Make the callback asynchronous and await both successful and failed response capture.
- `src/recordsStore.ts` currently accumulates `modelTurns` until final call recording. Queue each exchange after its begin record and await the actual durable acknowledgement; keep the completed record's exact model_turns projection. Write failures stop capture-enabled execution instead of silently continuing without evidence.
- `packages/natlang-records/src/{contract,client}.ts` and `workers/natlang-records/NatlangRecordsDO.ts` are the shared protocol/client/provider. Add an ordinal-bound append operation using the existing transactional annotation table. Same ordinal/same bytes is idempotent; conflicting bytes or gaps fail. Running call detail exposes committed exchanges without inventing a finished call record. Captured calls remain pinned until explicit cleanup; discard cannot erase them.
- Final call recording atomically reconciles the committed prefix and transfers it into the full record before deleting the temporary journal. Human annotations cannot impersonate reserved capture journal rows. No SQLite schema version change or live-table migration is needed.
- Host CLI interrupted-run retention and precleanup artifact copying consume these durable running-call details in a separate strand. A durable exchange is evidence, never an assertion that the task finished.
- The serving engines do not implement this store protocol: this adapter captures their returned generation/score results at one common boundary (`driver.ts:113-114`). Native trajectory materialization and learner admission consume completed capture artifacts; they do not own live model I/O. Core ts-host native graph recording is a different producer (`ts-host/src/native/model-recording.ts` in Natlang); this patch does not claim its independent crash-retention path has been audited.

## Native graph/value checkpoint protocol

The protocol and client (`packages/natlang-records/src/contract.ts`, `client.ts`)
add `checkpoint({callId,state,blobs,events?})`; the records worker implements it
without nested transactions. The opaque state binds its call/task and every
begin-definition field. All supplied value bytes are SHA-256 checked before
publication, and complete value references must resolve. Referenced and supplied
values are linked as capture evidence and pinned, including values acknowledged
by an earlier checkpoint. Running `getCall` exposes `capture_state` while its
final `record` remains null. `discard` preserves either capture journal.

The reserved `call-checkpoint` and `model-exchange` annotations cannot be written
through human annotation. Final recording checks exact committed exchange prefix
and begin identity, atomically relinks acknowledged capture values into the final
record and removes both journals. Failed finalization rolls back, preserving the
original unfinished evidence. Host CLI's opaque raw-record reader automatically
retains these additional fields; dataset success and target admission are separate.

A finalized record with committed model turns is immutable after event-stream
normalization: exact retries succeed, while changes to inputs, effects, output,
model responses or incidental detail fail. Corrections require a separate
reassessment. Previously completed model exchange prefixes remain protected even
after temporary journal removal. Existing uncaptured record updates retain their
explicit historical behavior. Native reference checks exclude the model_turns
payload itself, whose arbitrary user/model JSON is evidence rather than native
ValueRef structure. Completed record retries can reuse acknowledged referenced
values without retransmitting or orphaning their bytes.

## Attachment ownership, native reply custody and teacher authorization

Capture belongs to an attachment object, not its reusable runId string. Before a
paid request, `driver.ts` acquires a `ModelCaptureSession` from RecordsStore.
That session owns preflight, a snapshotted teacher identity, the response callback
and its completion barrier. The callback keeps its original epoch after detach;
old faults and old active call IDs cannot contaminate another attachment.
`runCell` joins capture sessions and always detaches in finally, including failed
live publication or failed record flushes. Normal uncaptured calls keep their
existing diagnostic-only recording behavior.

Original paid exchanges and native checkpoint/record values remain buffered until
acknowledgement; enqueue and detach never erase them. On a failed write, the
private native Host `retainCaptureEvidence` callback receives exact pending data,
owner and run identity and is awaited. Host ABI 3 binds and retains that evidence
outside the failed records service and finite execution disposal. The provider
also exposes private pendingCaptureEvidence for recovery. Capture-enabled requests
require this native sink before inference; these buffers and emergency artifacts
are evidence, never successful trajectories or automatic training admission.

The driver snapshots the native gateway result before translating it, so a
provider error/partial reply rejected by normalization is retained with its error
and raw provider bytes, without inventing a successful model completion. Both
score and generation paths use this mechanism. Captured teacher requests also
compare the resolved actual model against the attachment's pinned teacher before
either gateway method. Explicit model names and alternate roles cannot bypass the
pin, and repeated opt-in cannot clear or replace it. Unpinned user capture retains
its application-selected model behavior; independent review uses its own owner.

`captureOwnership.test.ts` covers detach/late reply, delayed old write failure,
failed append plus final write, blocked preflight, pending-session teardown,
raw provider normalization failure, absent custody, and teacher authorization.
`evalNatlang.test.ts` runs real lowered cells through the native runtime, including
a failed storage cell followed by a successful captured cell with the same runId.
