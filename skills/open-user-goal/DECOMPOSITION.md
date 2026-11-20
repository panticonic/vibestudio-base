# Open user goals

The root receives the user's goal as its only argument. It selects installed
skills based on the requested outcome and observations from this invocation.
The caller supplies the current workspace and authorized services. Evaluation
criteria, source coordinates, and expected tool calls stay in the harness.

| Procedure | Owner |
| --- | --- |
| Choose between public research and a local document revision | The root Natlang lambda. |
| Form search queries, assess candidate sources, and revise them after an unsuccessful attempt | The research Natlang lambda. |
| Read actual pages and ground the answer in exact excerpts | The existing web research skill. Workspace RPC owns the fetch and cached bytes. |
| Report success or what remains unresolved | The root retains the research result, including its citations and failures. |
| Identify the document and reconcile it with authoritative workspace evidence | A judgment lambda scoped to document revision. |
| Retry a revision against fresh state, preserving other edits | The document revision lambda chooses when to reread and revise. The managed service handles exact version comparison and storage. |
| Use verified public evidence as the basis for an authorized local revision | The root chooses the dependent call using the research outcome. The revision receives observed source evidence and current workspace contents. |
