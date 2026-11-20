---
description: Apply one selected checklist state change through the authorized input and read the resulting screen.
args:
  request: ChecklistChange
returns: TerminalEvent | null
---
Call openTerminalInput.change with the selected state change. Return the actual event or null when the requested edit is refused.
