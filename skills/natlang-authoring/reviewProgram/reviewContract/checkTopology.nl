---
description: Find required helpers missing from their assigned callable folders.
args:
  required: string[]
  functions: AuthoredFunction[]
returns: AuthoringFinding[]
---
Compare each expected source path literally against the compiler's callable paths. Return one missing-helper finding per absent path, with that path as subject and "missing" as observed. A name elsewhere in the program does not fill the requested folder.
