# Live panel repair

Policy stays in repairPanel.nl and its typed children: define checks, reproduce, diagnose, propose, verify.
The host factory createPanelRepair binds one caller-selected panel, context and panel repository. It never selects
an authority, publishes, or exposes generic filesystem writes. Exact identity checks, accessible locator execution,
source read/compare, atomic VCS edits and build requests are crisp outside-world mechanics.

Inventory before implementation: packages/natlang-services/src/select.ts is the sole declared-service selector;
catalog.ts/contracts.ts feed generated model declarations; packages/natlang/src/programs.ts passes eval bindings
through that selector. Runtime PanelHandle.observe/snapshot/cdp.session/rebuild expose real immutable attempts;
WorkspaceRuntime.vcs exposes context-bound status/resolveRepository/listFiles/readFile/edit with atomic expectedWorkingHead.
The build service getBuildReport compiles the selected context without publication. No engine protocol changes.

The caller supplies its existing bound VCS client, build client and already-open panel handle explicitly. The
factory validates context/source on every observation; stale generation/revision or mismatched before-text fails
before effects. All edits form one expected-head VCS command. Browser observations and mutations remain real
service calls, captured as ordinary Natlang effects. Direct-root collection uses the same service binding rather
than an outer agent transcript. Independent browser candidate scoring stays outside this service/model authority.

## Explicit invocation

From eval, use the caller's existing `vcs`, `services.build`, context and panel handle:

```ts
import { openPanel, vcs, contextId } from "@workspace/runtime";
import { createPanelRepair } from "@workspace/natlang-services";
const panel = await openPanel(panelSource, { contextId });
const panelRepair = createPanelRepair({ contextId, panelSource, panel, vcs, build: services.build });
const repair = await natlang.load("skills/workspace-dev/panel-repair/repairPanel.nl", {
  services: { panelRepair, panelRepairEdit: panelRepair },
});
return await repair({ panelSource, goal });
```

The load option is checked against the program's declared service names and narrowed by the existing selector.
Cached compiled code never caches a caller's adapters. This does not inject an outer agent or a new authority map.
The assigned handle must follow `ctx:<contextId>`. A successful build must identify an actual runtime build key;
rebuild must activate that same key before its rendered evidence is returned. Inspection reads the control's
value and rendered text. The CDP target inventory uses the same browser-side role and accessible-name rules
as its action locators. Reobserve when the candidate generation or rendered controls change. Every returned service value
is fresh data; no browser/VCS handle or mutable oracle object is returned to model code.

`natlang.json` grants the editing service only to the authored root. Diagnosis reads current evidence,
and the verification child exercises the running candidate.

Validation: initial focused run passed 28 tests (factory, selector, loader), and the strengthened factory's three
focused tests passed in isolation after a repeated parallel suite exceeded a 2 GB quota. The full Base composition
passed all four typecheck configurations under 8 GB (6 GB peak). Real managed-instance root execution and its
independent browser oracle remain a separate integration qualification; unit/type success does not claim those ran.
