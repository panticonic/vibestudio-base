# Open terminal handoffs

A user supplies a project outcome and permitted actions. The program works in
one disposable workspace context. It reads actual release-checklist state from
a live PTY and chooses successive edits, lifecycle operations, verified checks,
or a local artifact as the user's goal and observed results warrant.

| Responsibility | Existing implementation | Design |
| --- | --- | --- |
| Ownership and live terminal transport | System Testing checklist managed fixture and its `tests/_terminal-screen.ts`, native `terminalApps.launch`, `restart`, `resume`, `list`, `close`, and shell attach/write/kill/get | The new adapter keeps a receiver-owned session, consumes the existing acknowledged screen stream, and records exact identities and native exits. Existing fixture rules and data remain in place. |
| Keyboard and pointer controls | Base `terminal-apps/release-checklist` | The model selects a verb, displayed item and permitted input modality. Crisp code maps that to a literal key or the app's documented SGR mouse protocol, then waits for a new screen. Every write is followed by exact readback. |
| Durable continuity | Base `skills/terminal-apps/SKILL.md`, mounted `checklist/verifyChecklist/inspectOutcome` | Reuse the native review hierarchy through its child call for a retained state review after running reattachment or deliberate restart. Distinguish session ID from PTY and viewport. A separate exit record identifies a clean quit or independently observed interruption before resuming. |
| Scoped preflight and suite work | Base `skills/terminal/SKILL.md` and `terminal/natlang/runTerminalChecks`, with `bindTerminalChecks` | The workflow chooses when to attempt a bounded caller-owned local plan. The existing subtree handles dependencies and exit/output boundaries. Exact command recipes and private expected results never enter model context. |
| User authority and decisions | `operateTerminalGoal`, `chooseTerminalAction`, and `composeTerminalOutcome` | Plan one goal-relevant operation at a time from real screen and check evidence. Route state changes, retirement, and local evidence writing through named typed children. Summarize actual on-screen state, expected hold, and verified receipt. No model-authored shell text is executable. |
| Owned handoff | Base `scratch-handoff-bindings`, System Testing `readWorkspaceBytes` | Commit an atomic, bounded artifact only after explicit authority and the necessary live receipts. Independently read and hash its exact bytes. |
| Verification, trace and controls | New open family in System Testing and Host reader | Private recipes specify ordered meaningful outcomes, clean or interrupted native lifecycle, held steps, changed and unchanged state, and artifact contents. Verify session retirement independently of the model narrative. References share transport, never the semantic decision or scorer's expected values. |
