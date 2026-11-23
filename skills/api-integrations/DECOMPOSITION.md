# Sealed integration observations

The assignment seals destination IDs, URLs and transports. Native credential policy remains the authority; a model cannot retarget a URL, reveal credential fields or substitute an operation receipt. A plan read is repeatable observation, not a one-use permission. Destination selection belongs to the caller rather than a hidden array cursor.

Each destination has one operation-scoped native observation, including an in-flight observation. Replays join that observation and return copied public lifecycle fields. Native credential-policy requests are serialized because a failure can leave authorization unverified: queued new destinations then remain held, while already issued evidence can still be read. The native resolver receives the bound destination ID for correlation; the default credential RPC forwards only its actual URL/use contract.

SST's quiet review fixture consumes the same binder. Its callback must join by destination ID and its verifier must compare authenticated observations by ID, rather than require a lookup route or count repeated reads. Explicit user goals that require leaving later checks held remain outcome requirements.
