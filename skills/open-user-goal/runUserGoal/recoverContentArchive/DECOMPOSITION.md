# Recover an owned content archive

| Responsibility | Natlang or exact service |
| --- | --- |
| Identify the existing project and nominated edition | The discovery lambda receives the exact authorized repository, immutable archive coordinate and working revision. Read only the two assigned snapshots through the inspection lambda. |
| Distinguish immutable proof from working drift | A nested selection stage compares current and retained tree coordinates and rejects a valid-looking archive with a wrong binding. A second policy stage assesses exact relative-path digest evidence, archive manifest integrity, protected paths and authority. |
| Recover approved files together | A typed edit lambda forwards the selected immutable edition and the complete approved differing paths. The service rechecks archive bytes and the latest working revision before one semantic VCS edit. |
| Report and verify | Preserve the actual receipts and report the intended hold, no-op or restore. An independent verifier checks authoritative tree pages, VCS file and repository identities, approved final bytes, non-owned paths and protected history. |
