# Device and terminal review

This workflow interprets receipts already available to an authorized Vibestudio caller. Scope and evidence attribution precede any lifecycle judgment. A finding names the specific receipts needed for the user's next decision. Review does not create an invite, route a page, run a command, or control a terminal session.

| Skill | Natural-language judgment | Caller boundary |
| --- | --- | --- |
| Phone setup | Check System workspace, selected provider and attached phone; interpret preparation, physical action and workspace readiness. | Use public provisioning discovery, provision result, and readiness receipts. Keep the attached-device ID distinct from the paired-device ID. |
| Tendrils | Locate the active presentation, distinguish pushed and pending delivery, judge update, rollback, event tier or archived state. | Use channel, device, slot and build attribution from the panel host and Tendril worker. The reviewer gets event class and receipt identity only. |
| Terminal commands | Interpret whether the requested task used scoped filesystem or an appropriate admitted process mode, then explain the observed result boundary. | Use the shell extension's structured admission and terminal result. Command output stays data. No executable text is needed by this review. |
| Terminal apps | Match the selected workspace, manifest source, principal and session, then diagnose PTY continuity, state recovery or app-owned approval. | Use the terminal app session list, launch/resume result, durable state revisions and attributed host approval observations. |

Fixture records adapt the underlying schema into these smaller observations. They preserve identities used for scope checks and omit credentials and app connection material. The independent verifier checks expected findings and ordered evidence. Natlang owns the interpretations.

For a retained terminal operation, `reviewLiveTerminal` reads one scoped
receipt and delegates to `reviewTerminal`. The binding preserves the result's
origin even when it differs from the assigned operation. It projects flags
and exit status without supplying command text or output to the reviewer.
