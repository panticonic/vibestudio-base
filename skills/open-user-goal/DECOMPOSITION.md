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
| Interpret the current browser panel and choose an authorized unfinished action | The browser lambda owns the inspect, decide, act, and readback loop. Its decision child interprets observed row details and goal dependencies. |
| Observe the owned renderer and activate a current visible control | The managed CDP service checks renderer identity and the observed revision. The independent verifier reads the final panel state and checks action order and untouched rows. |
| Discover and verify the workspace test suite relevant to a user goal | A decision lambda selects a live declaration, an inspection or execution, and any requested filter. The existing suite-review Natlang subtree owns runtime interpretation and receipt assessment. |
| Resolve declarations and run the authorized declared suite | Vibestudio's existing verifier binds the selected route to the observed workspace state and returns the native or Workerd receipt. The independent outcome check re-resolves the current declaration. |
| Select an installed template skill for the user goal | The root Natlang lambda calls the News, Spectrolite, Drive, Mission Control, or System operations subtree exposed in its current workspace. Each subtree interprets the same goal against the state it can observe. |
| Bind template-specific services and check the completed outcome | The workspace supplies authorized services to its installed functions. The test runner keeps its starting-state setup and independent outcome checks outside the program. |
