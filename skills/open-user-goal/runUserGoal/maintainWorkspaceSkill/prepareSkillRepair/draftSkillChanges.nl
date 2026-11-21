---
description: Author the narrow Natlang source or configuration change.
args:
  goal: string
  observation: SkillMaintenanceObservation
returns: SkillMaintenanceChange[]
budget: { maxTurns: 14 }
---
1. Use the retained failing contract check, source text, and user intent to identify the changed workspace files. Limit edits to observation.editable.
2. For a typed signature or callable-folder repair, author the complete new .nl file, including YAML frontmatter, named args, exact returns, and clear instructions. Keep the intended surrounding responsibilities and narrow authority. If relocating a child, remove only the retired path by using null text. Existing shared entrypoints and unrelated files stay untouched.
3. For a service scope change, edit only the allowed natlang.json. Preserve its schema, package name, targets and service binding while narrowing its selector to the exact generated source path.
4. Return the actual changed file paths and replacement texts. Leave unchanged files out of the patch.
