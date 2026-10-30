---
description: Write the one-line subject that says what a set of changes does.
args:
  digest: ChangeDigest
  problem?: string
returns: string
---
Write one line that says what the changes in digest do, in this order:
1. Read digest.units. Each unit is a repository; each of its files says whether it was added, deleted, edited, moved or mode-changed.
2. Start with an imperative verb that fits: Add when files were added, Remove when deleted, Move when moved, Update or Change when edited.
3. Name what changed: the file or the thing it implements when one unit has one or two files, otherwise the repository (digest.units[i].unit).
   When several repositories change, name the one with the most files and add "and N other" with the count.
4. Use only what digest shows. A recorded intent in digest.intents may give the name of the thing changed. Do not add a reason that no intent states.
5. The line is at most 72 characters, has no trailing period, and is a single line.
When problem is given, your previous line was rejected for that reason: write a new line that avoids it.
