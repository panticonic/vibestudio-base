# Template errors and remedies

Act on the error returned by inspection or publication. There is no
installed-template composition to resume, no managed settings to repair, and
no flow for removing a template update.

| Failure                                           | Next action                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Private source needs credentials                  | Open the standard connection flow, then retry the fetch with the selected credential. Never store concrete credentials in the snapshot.       |
| Snapshot integrity or manifest validation failed  | Stop and show the returned details. Don't substitute another source or retry an integrity failure.                                            |
| Remote unavailable                                | Say which fetch failed and offer to try again later.                                                                                          |
| Authoring source changed after inspection         | Run `inspectAuthoring` again and review the new fingerprint and required parts before publishing.                                             |
| Authoring dependency or runtime companion missing | Fix the reported source dependency, then inspect the complete selection again.                                                                |
| Publication failed                                | Check the recorded command outcome before retrying. Keep its command ID for reconciliation; don't assume the remote destination is unchanged. |

Inspection doesn't bring in source or grant authority. Say that no workspace
source changed only when the operation's outcome shows it. Workspace creation,
unit admission, selected-file copying, and VCS merges each have their own
outcomes and review flows; don't describe any of them as installing a
template.
