# Terminal checks in Natlang

| Work | Form | Reason |
| --- | --- | --- |
| Decide whether a task needs an OS process | Skill guidance and caller assignment | Programmatic scratch work belongs to the workspace filesystem service. |
| Choose a ready check | `selectNextCheck` | The goal and observed results guide which assigned check to run next. |
| Invoke an exact command once | `performCheck` with a caller-bound shell service | Context, argument boundaries, and output and time limits must survive model execution exactly. |
| Interpret a bounded result | `classifyResult` | A timeout, truncation, process failure, or unavailable result warrants a different report. |
| Explain completed and held checks | `runTerminalChecks` | Independent checks can proceed after an unsuccessful result. Dependent checks require confirmed completion. |

The binder seals the plan and checks each dependency against the actual process
result. The installed shell extension retains its ordinary approval behavior.
