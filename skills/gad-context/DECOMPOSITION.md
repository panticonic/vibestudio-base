# GAD channel review in Natlang

| Stage | Form | Reason |
| --- | --- | --- |
| Read current channel health | Scoped snapshot service | The typed GAD API excludes the caller's own turn. Its counters and publication coordinates are exact. |
| Interpret integrity and activity | `reviewHealth` and `classifyFinding` | The workflow distinguishes ordinary in-flight work from evidence that requires attention. |
| Choose and inspect a follow-up | `chooseFollowUp` and `inspectFinding` | The goal determines which observed finding to pursue. The service accepts only an inspector supported by the observed finding and seals its channel and branch. |
| Review recent conversation | `reviewConversation` with separate read and interpretation leaves | Exact ordering comes from bounded envelope diagnostics. The latest message's meaning requires judgment. |
| Return the review | `reviewChannel` | The user goal determines the relevant branches. Health, follow-up and channel-wide conversation retain their distinct receipts. |

The TypeScript adapter reuses the existing GAD client, finding counts and
transcript summarizer. It projects only bounded evidence. A channel-wide tail
can accompany a current channel review. Historical branch reviews hold that
read because the envelope paging API has no branch selector.
