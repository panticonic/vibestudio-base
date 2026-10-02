# Mission Control store authority

The singleton owns transactional SQLite project, task and saved-view records.
Its narrow RPC operations are workspace-private, admit user/code/session/mission
principals, and carry explicit read/write receiver sensitivity. There is no
raw SQL endpoint and no website exposure. The service admits the host for
framework activation probes; product methods retain their narrower principals.

Only `panels/mission-control` and `workers/mission-agent` receive declared
service wiring. Other consumers require consent. Execution commands create
the installed MissionAgent vessel and use the exact workspace MissionsDO
service. Normal runtime management and Missions edit/run permissions apply
independently. The store does not mint grants, decide approval cards, publish
source, implement a scheduler, or own agent turns.

Task revisions prevent human/agent lost updates. Execution command ownership
serializes installation/start/cancel for each task while ordinary card edits
remain usable. Cancellation only changes the card after MissionsDO joins its
owned runs. Archival checks authoritative automation state and live runs.
