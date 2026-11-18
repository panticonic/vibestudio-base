# Runtime evidence review

This program joins the Natlang authoring, sandbox execution and GAD context guides.
It accepts compiler, eval-surface and log-inspector observations already scoped by the caller.
It keeps language diagnostics distinct from eval scope and from private trajectory versus public channel evidence.

The Natlang branch reviews compiler status, then checks the exact call outcome before suggesting the next operation.
The eval branch reviews execution surfaces, handle lifecycle and workspace ownership before the requested user-visible effect.
The GAD branch interprets integrity, current activity and bounded joins before choosing one follow-up read.
Actual code execution, permissions, prompt persistence and log traversal stay with the existing typed Vibestudio mechanisms.

An owned program execution receipt extends the compile review. ReviewProgram checks the real compiler
result first, then delegates to inspectLoadedExecution when the caller supplies the exact EvalDO
receipt. This separates checked output, unchecked execution, failure and source staleness. The
system-test adapter stages source in a scratch context and executes the assigned typed callable
through natlang.load. Source fingerprints and return checks are crisp. Existing trajectory calls
continue to use the separate inspectCall branch.
