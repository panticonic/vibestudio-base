---
description: Choose an exact specialist for the actual product change and user scope.
args:
  goal: string
  index: SpecialistIndex
returns: SpecialistChoice
---
Read the requested concern, any named assignee, and explicit permission to consider another available worker. Choose the exact matching role and handle. Generic coordinators or historical reports do not substitute for the designated specialist. If the goal leaves several indistinguishable viable handles, return ambiguous-specialist and null. If no specialist covers the concern, return no-suitable-specialist and null. For an explicitly named specialist keep the exact handle even if its current membership must be checked. Return chosen with the exact handle. Do not send, launch a replacement, or guess a handle.
