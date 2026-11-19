# Extension release review

The caller assigns an installed extension and a method it wants to assess.
The workflow first reads the repository tree and manifest at the owned working head and protected
main. It then reads the actual declared extension's status in the host.
The source and runtime observations carry their exact revisions and identity.

- Source review separates method declaration from whether the declaration is
  published. A code-only change can still be unpublished. An unrelated workspace edit
  leaves the assigned extension tree digest unchanged.
- Runtime review separates the active approved build from a candidate,
  pending review, cold activation and failure. It checks a public method
  against the live method list only when a running process is observed.
- The root combines both reviews and holds work where the relevant source or
  live observation is missing. Semantic reads, manifest projection, status
  calls and observation binding are exact TypeScript.
- This workflow has read-only services. Editing, publishing, activation and
  invocation are distinct operations with their existing authority.
