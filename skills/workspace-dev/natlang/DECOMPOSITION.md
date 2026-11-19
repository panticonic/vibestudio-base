# Unit identity workflow

| Responsibility | Implementation |
|---|---|
| Read one installed unit and its icon at the caller's working head | TypeScript VCS binding |
| Choose the image's meaning and family | Existing Natlang `iconIntent` |
| Resolve the authoring input and prepare canonical artwork | Existing workspace-dev catalog |
| Distinguish a design review, a verified existing icon, and an authorized edit | Natlang assessment |
| Change the manifest and artwork together at the exact observed working head | Existing `setUnitIcon` semantic edit |
| Read back the new working state and check the asset, other manifest fields, and main | TypeScript binding with a Natlang outcome decision |

The shared root uses the same icon intent as the standalone workspace-dev
suite. The caller owns the allowed repository and chooses review or preparation.
The prepared change stays in the caller's working state.
