# Assigned public source authority

The assignment supplies a reading scope, not an execution script. The semantic research hierarchy chooses which of those sources to read, in what order, and how much cached content is needed for the user's question.

| Mechanism | Contract |
| --- | --- |
| Source authority | Only explicitly assigned HTTP(S) URLs without embedded credentials; cookie-free public session |
| Retrieval | Any assigned URL, with independent concurrent reads and retries after transport failures |
| Cached content | Any valid bounded byte range of a digest actually fetched during this invocation |
| Read limits | Shared web-core byte limits, rather than a fixed head continuation or global call count |
| Outcome evidence | Actual fetch receipts and cached bytes; source membership never requires exhausting the list |

Search and imported-cookie browser sessions are not part of this binding. The general public research binding has its own broader public-source authority.
