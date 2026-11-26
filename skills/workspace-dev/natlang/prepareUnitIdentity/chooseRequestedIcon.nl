---
description: Interpret the requested artwork while preserving the unit's actual purpose.
uses: [iconIntent]
args:
  goal: string
  unit: UnitDescription
returns: IconIntent
---
Determine what artwork the user actually requested. An explicit icon name and family in the goal take precedence over a recommendation based on the unit's purpose. Preserve that exact requested term and family, even when you do not know whether the installed catalog contains it; the native catalog resolver establishes availability. A related symbol is not confirmation of the requested symbol.

For a visual concept rather than an exact name, interpret that concept in the requested family. When the goal leaves the choice entirely to the unit's purpose, use iconIntent(unit) for that recommendation. Keep unit unchanged. Return only the intended family and term; this interpretation neither verifies catalog availability nor grants permission to stage artwork.
