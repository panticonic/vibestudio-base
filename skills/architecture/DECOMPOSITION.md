# Architecture boundary review

The caller supplies one proposed owner of durable state, its installed service,
and the exact semantic context. The workflow resolves the real service by
protocol, reads its matching authored declaration at the working head and
distinguishes the reachable receiver from the authoritative boundary.

- Provider inspection separates resolving the installed service, reading its
  exact declaration and checking that provider identity and protocol agree.
- Ownership review separately selects the authoritative owner and determines
  whether a proposed cache, panel or transport can own the state.
- The root joins both decisions into a next step. A receiver declaration
  alone cannot establish authorization, and a local context cannot route to
  another workspace.
- The TypeScript binding handles canonical resolver and VCS calls, pins the
  declared package read, and binds the observed source to the original
  assignment. It does not invoke the resolved receiver.
