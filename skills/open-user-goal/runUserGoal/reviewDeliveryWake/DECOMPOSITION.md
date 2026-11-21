# Recover an owned channel delivery after wake

1. Discover the requested event, recipient revision, saved observation point and authorized recovery scope.
2. Open one bounded current client observation. Keep the first rejected attempt and recover the one ready subscription when possible. Read the exact projector's cursor and recipient mailbox using a nested inspection lambda.
3. Decide whether the requested receiver and exact terminal are current, whether a retained detach range can be safely completed, and whether to hold for missing or mismatched evidence. A second reasoning lambda checks the exact native event and recipient revision.
4. Advance one approved same-recipient native backfill only after matching the saved cursor and present native range, preserving existing receipts.
5. Return the actual verified event, preservation facts and optional wake proof. The independent oracle reads native normalized rows and the foreign/old receiver's unaffected state. Transport, SQLite, cursor advancement and exact checking are crisp.
