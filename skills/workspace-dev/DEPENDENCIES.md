# External dependency resolution

Buildable workspace units are not pnpm importers. List registry dependencies in
the unit's `dependencies` and resolution policy under
`vibestudio.dependencyResolution`. Build V2 reads both from the materialized
source it is building and never inherits the root package manager's policy.

## Contents

- [Declare dependencies](#declare-dependencies)
- [Use ranges by default](#use-ranges-by-default)
- [Own it, or let the realm provide it](#own-it-or-let-the-realm-provide-it)
- [Override a resolution](#override-a-resolution)
- [Patch an exact dependency](#patch-an-exact-dependency)
- [Own a patched integration](#own-a-patched-integration)
- [Understand the live build behavior](#understand-the-live-build-behavior)
- [Diagnose and verify](#diagnose-and-verify)

## Declare dependencies

Put every directly imported external package in `dependencies` with a registry
version:

```json
{
  "dependencies": {
    "upstream-package": "1.2.3"
  }
}
```

Use `workspace:*` for internal workspace packages. Do not add a buildable unit
to `pnpm-workspace.yaml`, the checkout lockfile, or the host's dependencies.
When Build V2 builds a consumer, it installs the external dependency closure
into a content-addressed derived environment.

Declare everything you import; nothing is added for you. A package that no
manifest lists is not installed, even if one of your dependencies names it as
a peer. The gap shows up as an unresolved import naming the specifier, never as
a version picked for you.

## Use ranges by default

Pinning an exact version claims that no other compatible release works with
your code. Do not make that claim by accident. Use the narrowest semver range
that is actually true, so builds can reuse the dependency set packaged with the
Host.

Exact pins need a concrete byte-identity or ABI reason. Currently the valid
reasons are a source patch whose selector names exact bytes, and JavaScript for
a native module or renderer that must match the version compiled into the
mobile APK. The manifest must record the reason through
`vibestudio.dependencyResolution`, the mobile native-module policy, or a
comment next to the dependency. Test tooling, preference, and "this is what was
installed when I wrote it" are not reasons to pin.

`pnpm check:userland-dependencies` enforces reuse in both directions:
undocumented exact pins fail, and every Host runtime range shared with Base
must fall entirely within Base's accepted range. Overlap is not enough, because
a later Host installation may legitimately pick a lower version.

## Own it, or let the realm provide it

The two fields differ in who supplies the running instance.

`dependencies` are yours. They are installed for your closure and bundled into
your artifact at the version you name.

`peerDependencies` belong to whatever loads you. They are installed so your
code typechecks but are never bundled; the realm that loads you supplies the
live instance.

This matters at runtime. A panel's inline UI, a `feedback_custom` component,
and an eval'd snippet all run inside the _panel's_ realm and resolve imports
through that realm's module map. A guest that bundles its own React puts a
second React into the realm, so the host's hooks and the guest's hooks are no
longer the same. The result is a hook error far from its cause, or a Radix
component rendering outside the host's Theme.

Which field to use depends on how the unit is loaded:

| Unit                   | Loaded               | React and the UI kit go in       |
| ---------------------- | -------------------- | -------------------------------- |
| Panel, about page, app | On its own           | `dependencies` (it is the realm) |
| Worker, extension      | On its own           | `dependencies`, if it renders    |
| Skill, package         | Into another's realm | `peerDependencies`               |

A unit loaded on its own has nothing above it to provide peers, so it must own
every peer its closure needs. Otherwise Build V2 refuses it and names the
packages that asked:

```
@workspace-about/new is loaded on its own, so nothing provides its closure's
peers: react-dom@19.2.4 (required by @workspace/about-shared, @workspace/react,
@workspace/ui). Declare each as a dependency of @workspace-about/new at the
version it should own.
```

Declare `react` and `react-dom` together. `react-dom` has its own peer range on
`react`, so a unit that owns only one of them gets whichever renderer version
happens to resolve first.

A library leaves its peers external and gets them from the realm when it
loads. If the realm lacks one, loading fails with an error naming the module.
Fix that by exposing the module on the host panel (`vibestudio.exposeModules`),
not by moving the peer into `dependencies`.

### Say what you actually accept

A peer range is checked against every consumer, so write the range you mean:

```json
{
  "peerDependencies": { "react": "^19.0.0" },
  "peerDependenciesMeta": { "react": { "optional": true } }
}
```

An exact `19.0.0` accepts _only_ 19.0.0, so a consuming app that owns 19.2.4 is
refused. `^19.0.0` usually expresses what a shared package means: any React 19
the consumer owns. `@workspace/quickfire-core` needs exactly this, because the
desktop shell provides 19.2.4 while `apps/mobile` provides 19.0.0, which is
pinned by the react-native renderer compiled into the installed APK.

Mark a peer `optional` when only part of your package needs it, most often for
a type-only reference (`import type { ComponentType } from "react"`). It is
still installed for typechecking and still external, but a consumer that never
uses that part does not have to own an instance. `@workspace/eval` and
`@workspace/agentic-core` declare React this way, which is why a worker can use
them without owning a renderer it never runs.

A peer is optional for a closure only if every package that declares it marks
it optional. One package that really renders makes the instance required for
all of them.

## Override a resolution

Put version overrides in the unit that owns the integration:

```json
{
  "vibestudio": {
    "dependencyResolution": {
      "overrides": {
        "transitive-package": "4.5.6",
        "ws@8": "8.21.1"
      }
    }
  }
}
```

Override keys name a package or a single major version of a package. Values
must be registry versions Build V2 accepts. Overriding a direct dependency
changes that install request; overriding a transitive dependency becomes npm
resolution policy in the derived install. Overrides apply across the unit's
internal workspace dependency closure. Conflicting values for the same selector
fail the build.

Do not use top-level `overrides`, `resolutions`, `pnpm.overrides`, or
`pnpm.patchedDependencies` in a buildable unit. Those are package-manager
settings and have no effect on workspace builds.

## Patch an exact dependency

Declare a unified text diff in the unit that owns it:

```json
{
  "dependencies": {
    "upstream-package": "1.2.3"
  },
  "vibestudio": {
    "dependencyResolution": {
      "patches": {
        "upstream-package@1.2.3": {
          "path": "patches/upstream-package@1.2.3.patch",
          "roots": ["upstream-package"]
        }
      }
    }
  }
}
```

The selector must be an exact registry `package@version`, including the scope
for scoped packages; ranges are invalid. `path` is relative to the declaring
unit and must stay inside it. File paths inside the patch may use the usual
`a/` and `b/` prefixes; absolute paths, `..`, and paths through symlinks are
rejected.

`roots` lists one or more of the owner's direct external dependencies whose
installed closures contain the target:

- For a direct patch, name the target itself.
- For a transitive patch, name the direct dependency it comes through.
- If several direct dependencies can bring in the same exact target, name each
  of them.

For example, to patch `transitive-package` reached through `parent-package`:

```json
{
  "dependencies": {
    "parent-package": "7.0.0"
  },
  "vibestudio": {
    "dependencyResolution": {
      "patches": {
        "transitive-package@4.5.6": {
          "path": "patches/transitive-package@4.5.6.patch",
          "roots": ["parent-package"]
        }
      }
    }
  }
}
```

Every root must be a direct external dependency of the owner. `roots` only
decides which derived dependency subsets include the patch; it does not request
a dependency, and it does not make a missing target optional.

## Own a patched integration

Give a patched external package a single owner in the workspace, normally an
adapter package under `packages/`:

1. Put the upstream dependency, overrides, patch file, and patch declaration in
   the adapter.
2. Export the API the workspace needs from the adapter.
3. Make consumers depend on and import the adapter, not the patched upstream
   package.

Within one internal dependency closure, no other unit may depend directly on or
override the patched package, and no two owners may declare the same exact
patch selector. This way, importing the adapter's name is how code opts into
the patched version, and plain upstream imports are never changed silently. For
long-lived changes spanning several packages, publish an immutable fork and
depend on its exact versions instead of carrying local patches.

Use an adapter even when the target is transitive: the adapter depends on the
direct dependency named in `roots`, carries the policy, and exposes a stable API
to the workspace. Do not make the host, the root installer, or unrelated
consumers aware of that userland dependency.

## Understand the live build behavior

For each build, Build V2:

1. Collects policies and patch bytes from the unit's internal source closure,
   separating externals the unit owns from those its peers leave to the realm
   that loads it.
2. Reuses a complete dependency set packaged with the Host when it satisfies
   the whole closure and no override or patch changes the requested bytes.
   Otherwise it installs a derived registry environment containing both owned
   packages and peers (a typecheck needs the peers' declarations) and nothing
   else.
3. Applies each patch to every installed package whose name and version match
   the selector exactly, including hoisted and nested copies.
4. Includes dependency versions, overrides, patch roots, and patch-content
   digests in the cache key and build recipe.
5. Records the digest of every patched or deleted file and rejects a modified
   or incomplete cache receipt.

The compiler resolves every bare import through that prepared environment. It
does not search parent directories of the source path the way Node does, so an
undeclared package in `~/node_modules` is never a build input. Installed package
manifests and their nesting are part of the build key, so reinstalling the Host
with a different valid dependency graph cannot reuse an artifact built from the
old one.

Patching is strict. The build fails for a missing patch file, an unsafe path, a
duplicate owner, a conflicting override, a missing declared root, a selector
that matches no installed package, an empty patch, or a hunk that does not
apply. Patches are unified text diffs applied after installation; they do not
change install-script behavior and cannot patch binaries.

Extensions can get a smaller runtime dependency install after bundling. A patch
is part of that install only if at least one of its roots is still external;
once included, it is still mandatory and must match. A patch whose roots were
all bundled stays out of the runtime install but still affects the build
environment. Runtime dependency caches and sealed recipes keep the same patch
inputs so the install can be rebuilt after eviction.

### Checkout validation limitation

Runtime Build V2 isolates each unit's closure, so it can build a patched and an
unpatched consumer of the same exact transitive package side by side. The
checkout-wide TypeScript and Vitest commands, however, merge all userland
requirements into one validation install and cannot represent both versions at
once. The native agent packages use the published `@panticonic/pi-*` fork at
exact version `1.1.0-vibestudio.1`, so that closure has no patched/unpatched Pi
split.

Do not work around this by preferring root `node_modules`, aliasing one test
conditionally, or applying the patch to the whole checkout. A proper fix needs
TypeScript/Vitest projects per policy closure, an explicit rule for integration
tests that span closures, and runtime projections with install scripts enabled
for tests that load native dependencies. Until that exists, treat adding a
second, unpatched consumer as blocked on validation, even though Build V2 can
build it correctly in isolation.

## Diagnose and verify

Run a Build V2 report for the consuming unit. A root `pnpm install` does not
apply userland patches and says nothing about whether a patch works.

Build refusals caused by dependencies name their own fix:

| Refusal                                                      | Meaning and fix                                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `loaded on its own, so nothing provides its closure's peers` | A unit loaded on its own needs a peer nobody owns. Add it to that unit's `dependencies`.                         |
| `resolves a dependency its own closure rejects`              | A peer range excludes the version the consumer owns. Correct or widen the range.                                 |
| `requires X@range, but the closure installed X@version`      | Two installed packages disagree. Declare a version all their dependents accept.                                  |
| `Module "X" not available` at load                           | A library's peer is missing from the realm loading it. Expose it on the host panel (`vibestudio.exposeModules`). |

From a Vibestudio source checkout, run the relevant focused tests plus:

```sh
pnpm check:userland-dependencies
pnpm check:package-dependencies
pnpm check:userland-package-manager-boundary
pnpm type-check:userland
```

`check:userland-dependencies` checks dependency ownership for every unit from
the dependency graph alone, without building, and prints the same refusal a
build would. Run it after editing any manifest: a build only checks the unit
being built, so an app whose closure lost an owner may not fail until it is
loaded on a device. Inside a workspace, `verify` runs the same check for the
unit it verifies.

The boundary check rejects userland package-manager policy, host dependencies
on userland units, and root patches that reach into `workspace/`. When updating
an upstream version, update its direct dependency, exact patch selector, and
patch contents together, then rebuild the real consumer. A patch that no longer
applies must fail visibly; do not keep it alive through a best-effort or
install-once path.
