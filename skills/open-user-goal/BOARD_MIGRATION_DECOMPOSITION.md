# Owned board migration

A user can ask to retain selected work from a rendered legacy board, compare a staged workspace copy, or hold a migration when approval and observed data disagree. The task owns the source browser panels, the target review directory, the approval manifest, and the fixture lifetime.

- The entry point interprets the goal and chooses this workflow when a board migration calls for source inspection and target readback.
- Source selection chooses the exact board and edition among owned browser surfaces. The browser service performs read-only CDP observation and returns board and card identity with the rendered generation.
- Scope selection reasons over the user's requested work, archive policy, selected lists, and target. It returns the intended card IDs, including an empty selection where appropriate.
- The migration decision compares the exact observed revision, approval, card data and existing target. It reports an audit or hold when existing state or authorization conflicts.
- The migration service does the crisp source and destination checks and persists only the admitted document, with exact independent readback. The result lambda explains the result and returns the receipt.
- Managed references use disposable browser panels and workspace state. An authenticated external Trello board remains the separately selected live acceptance test.
