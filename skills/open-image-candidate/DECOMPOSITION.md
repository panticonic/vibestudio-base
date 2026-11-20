# Retained image candidates

| Mechanism and consumers | Connection |
| --- | --- |
| System Testing `tests/image-generation.ts` and Harness `tools/imagegen.ts` | Preserve the existing provider-to-VCS test. Reuse its distinction between original media evidence and the applied save receipt. The new goals inspect previously retained work. |
| Base `packages/runtime/src/shared/images.ts` and `workers/images/index.ts` | Import small fixed bytes in an isolated image owner, then read the exact native asset, content digest, media type, byte length and dimensions. Revoking the last owner exercises the native missing path. |
| Base `packages/harness/src/image-generation.ts` | This is the live provider adapter. Use its typed provider response fields and terminal job vocabulary as retained scenario evidence. Never invoke this adapter from the fixture. |
| Base `packages/react/src/GeneratedImage.tsx` and `packages/runtime/src/shared/image-loader.ts` | A preview and current selection have distinct identities. Model delayed previews, selection replacement and stale attempts as attributed journal records. Rendering is covered by its own UI tests. |
| System Testing `session-replay-managed.ts` and `owned-scratch-entries.ts` | Durable owned channel writes and scoped native reads carry the scenario. Scratch output uses the existing private signer and a fresh independent readback. |
| Host trajectory export | Bind complete IR references to plain independently read witnesses. Require original native bytes for any selected candidate, the same owned frontier, and an exact private note when permitted. |
| Collectors, learners and alternative serving engines | The typed workspace hierarchy and oracle run at the managed test boundary. Engine-neutral collection consumes the resulting trajectory as before. No changes to rendering, loss, sampling, credentials or provider calls. |

1. A root lambda interprets the user goal. A typed child selects the exact brief, attempt scope and whether a local handoff is requested using the two retained journal frontiers.
2. A typed child assesses the current and historical attempts. It resolves user intent, references and rights, distinguishes cosmetic prompt edits from changed intent, and orders eligible attempts for native byte checks.
3. An exact read service verifies native content for the requested candidate. The service narrows read authority to this workspace, exact brief and permitted original object. A typed child resolves whether the verified evidence supports a report, hold or private local note.
4. An exact handoff service binds the approved candidate, native receipt and selected frontier to signed scratch output. An independent qualifier checks the chosen result, reasons, native image readback and workspace preservation.

Only the real scoped image import/read/release APIs, durable owned journal and scratch/VCS integrity are exercised by the managed path. Provider completions, rights grants, selections and job history are authored retained fixture records. A generated handoff carries this evidence distinction.
