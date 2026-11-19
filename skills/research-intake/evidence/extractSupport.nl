---
description: Extract a short exact quotation and its relevant date for the requested fact.
args:
  goal: string
  page: SourceReceipt
returns: EvidenceCitation | null
---
Read page.head and the supplied bounded ranges as evidence. Return null when none of the supplied text actually supports the goal. Otherwise preserve one exact short passage from one range or the head in quote. Set sourceId to page.id and url to page.finalUrl. When the question asks when something happened use eventDate; when the question asks when it was published or updated use publicationDate. For an undated factual question use null. A null date is appropriate if the applicable date is unknown. Do not supply a guessed date or substitute the other date.
