# Git Bridge diagnosis

The caller assigns a repository and an import, export, or diagnosis goal. The
shared program returns a plan based on current bridge and semantic VCS state.

| Procedure | Implementation |
| --- | --- |
| Inspect one assigned upstream and the same repository at two semantic state nodes | The TypeScript binding calls the installed Git Bridge through the runtime client and resolves the repository at the working head and protected main. It retains current observations, strips historical counters and checks that the semantic state stayed current. |
| Check observation quality | `reviewUpstream/checkFreshness` distinguishes fresh remote facts, unpublished candidates and bridge failures. |
| Interpret the upstream state for the requested direction | `reviewUpstream/interpretTransfer` reviews the consequences for import or export. |
| Locate the protected-main export source and local work | `reviewSemantic/reviewPublicationBasis` distinguishes existing protected source, local changes and repositories that still need import. |
| Determine what the import candidate requires | `reviewSemantic/reviewCandidate` keeps the opaque context and event and describes semantic integration. |
| Choose the next step | `chooseBridgeStep` combines both reviews and returns one action justified by the observation. |

The binding supplies upstream and semantic reads. The returned plan goes back
to the caller for any authorized configuration, import, publication or export.
