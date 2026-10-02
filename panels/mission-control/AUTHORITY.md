# Mission Control panel authority

This panel reads and edits private workspace planning data through the exact
`do:workers/mission-control-store:MissionControlStore:main` service binding.
Its manifest requests `mission-control.v1`; the service declares wiring for
this panel and the MissionAgent worker. Other callers require normal consent.
Website receivers are closed.

The panel opens ordinary chat panels and focuses their exact conversations.
Runtime lifecycle effects use normal `workspace.runtime-state.manage`
authority. Repository discovery uses the ordinary read-only workspace source
tree. The panel has no credentials, external network, SQL console, source
publication, or permission-decision surface.

Execution controls call app-shaped service methods. The automation and agent
owners independently acquire their real downstream authority; project
repository selection never substitutes for permission acquisition.

Opening a retained lead or task conversation crosses into its exact execution
context. The panel declares `context.boundary` for these bounded chat links;
normal context approvals remain necessary.
