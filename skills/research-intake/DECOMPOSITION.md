# Research and integration intake

The workflow reviews observations already obtained by a Vibestudio caller. It takes the search query rows, fetch URL and digest, bounded byte-range read receipts, and deliberately reduced API capability and authorization dispositions. Its output names the exact source URL or evidence rows behind each result.

| Source procedure | Native decision | Exact boundary |
| --- | --- | --- |
| Web research discovery and supplied URLs | Distinguish supplied provenance, fetched candidates, and discovery-only entries. | Match the supplied/requested URL and join fetch/read digest and byte offsets. |
| Evidence and citations | Decide which page passage addresses the requested fact, preserving primary source priority and the date actually stated. | Require a verbatim excerpt from the selected passage and cite the final fetched URL. |
| Source comparison | Relate two sources to the same event, measure or availability claim, then report agreement, conflict, stale evidence or uncertainty. | Independently identify both receipts; compare expressed values as typed source passages before asserting resolution. |
| API integrations | Decide whether a documented read is ready, the host says authorization or setup is needed, or the relevant receiver/response is wrong. | Use the exact host URL/operation matching and sanitized outcomes; a schema or error code never authorizes a new request. |

The workflow does not ingest credentials or issue a web/API call. The public workflow is pure over caller-owned observations. Existing Web Research and API Integrations workflows retain the actual authority, egress and setup UI.
