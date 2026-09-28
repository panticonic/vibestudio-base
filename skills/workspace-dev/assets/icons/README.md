# Scaffold icon sources

`lucide/` contains all 2,007 SVGs (including aliases) from `lucide-static@1.27.0`,
under the license in `LUCIDE-LICENSE`. Total SVG content is 966,190 bytes.
`brands/` contains the selected Simple Icons 16.27.1 marks, with colors declared
in `create-project.ts`.

These are offline source assets. They are not imported into scaffold tooling,
UI bundles, or generated projects as a library. A scaffold reads and copies one
selected SVG to the unit's own `assets/icon.svg`. Discovery enumerates names,
without reading SVG content.

From the Vibestudio host checkout, reproduce the Lucide assets with:

```sh
python3 scripts/sync-project-lucide-icons.py /path/to/templates/base
```

The refresh verifies the pinned npm archive's SHA-512 integrity and copies only
SVGs and the upstream license. It is a maintainer operation, never a build or
startup step. When updating the pin, review removed upstream names and update
the version and count documented here and in the workspace-dev references.
