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

Target-state requests name the items to check, the items to clear, and any
ordering constraints in the goal. `planEdits` derives which keys are relevant
from the initial terminal readback and chooses their sequence. Exact set
checks ensure the chosen order contains every needed toggle once and leaves
unassigned items intact. The verification stages check both each transition
and the final target at the observed viewport.
