# Open session recovery

Recovery starts from the user's goal and the retained conversations visible to
the caller. It distinguishes a durable message from duplicate wording, a
complete replay from a partial window, and an accepted handoff from a new note
that arrived outside the retained window.

| Responsibility | Implementation |
| --- | --- |
| Find relevant retained sessions | `chooseRecoverySources` interprets the goal and the named authorized session catalog. |
| Resume exact retained windows | TypeScript binds the installed transcript cursor to a real PubSub channel and follows the stable native replay boundary. Saved cursors keep their original channel identity. |
| Resolve the work state from the observed record | `interpretRecovery` distinguishes completed approvals, conflicting sources, missing evidence, and caught-up continuations. `selectRecoveryCitations` binds each finding to its actual message identity and text. |
| Decide whether to stage a handoff | The Natlang flow stages only when requested and supported by complete observations. |
| Write the handoff and verify its contents | TypeScript resolves admitted citations from the current replay, writes in owned scratch, and returns a digest after readback. The managed verifier independently checks the channel record and the saved bytes. |

The managed test seeds authorized source channels through the real HeadlessSession
client and closes each client before recovery. Distinct channels may contain
identical notes. A fixture can append a late note after the replay frontier has
been captured. Its expected disposition, evidence, and artifact remain private
to the verifier.
