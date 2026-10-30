---
description: Summarize a channel from pages of its compact envelope history, saying who spoke, what kinds of envelopes there are, and how the conversation stands.
args:
  pages: EnvelopePage[]
returns: ChannelSummary
---
Call collect with pages and return its result exactly as collect gave it, from eval. It merges the pages, counts the
envelopes, and reads how the conversation stands from its last message.
