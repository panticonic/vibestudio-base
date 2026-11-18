# Checklist lifecycle

The sample terminal app uses the workspace launcher, its own PTY and durable
session state. Its state survives a new process created by the launcher.

The Natlang workflow owns the sequence of the scoped task. `openSession`,
`editItems` and `resumeSession` invoke separate caller-bound services. Their
children return actual terminal readbacks. `inspectOutcome` checks terminal
identity and state independently. The caller owns PTY stream transport,
approved keys, and closing its session.

A resumed screen verifies app state at the new viewport. Reattachment retains
the process identity, while restarting retains the durable session identity.
