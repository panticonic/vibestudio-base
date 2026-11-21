---
description: Decide whether a new attempt, retry, reuse, or hold is justified by current evidence.
args:
  assignment: IllustrationAssignment
  basis: IllustrationBasis
returns: IllustrationDecision
---
1. For a requested save with an occupied create-only destination, hold occupied. An unapproved input reference holds reference.
2. A verified successful native job should be reused with reason already-generated even when generation is no longer authorized. A queued or running job holds busy rather than creating a duplicate.
3. A failed or canceled job requires both generation and specific retry approval. Otherwise hold no-retry. If both are permitted, retry the same job with reason retry.
4. Without a retained job, create with reason new only if generation is authorized. Otherwise hold no-generation.
