---
description: Read the assigned channel's current durable membership for the selected handle.
args:
  request: ChannelAgentRequest
returns: RosterObservation
---
Call channelAgentRead.read(request) and return its observation unchanged. The observation compares the actual worker identity to the assigned worker within the channel.
