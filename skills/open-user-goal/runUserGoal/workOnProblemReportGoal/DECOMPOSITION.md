# Local incident report within an open workspace goal

The shared workspace entry routes an explicit local incident draft request to
`workOnProblemReportGoal`. Its selection lambda distinguishes the current
reported incident from neighboring records using the user's scope and the
live incident catalog. The scoped binding resolves one selected incident into
its actual local draft operation.

The installed problem-reporting tree owns defect classification, exact draft
revision policy, narrative composition, writes and verification. The parent
passes the goal unchanged and returns the installed tree's receipt. The
native problem report service owns revision-checked persistence. The harness
reads its stored bytes and checks surrounding reports and submission state.
