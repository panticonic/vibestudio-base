---
description: Compare the provider declaration and real receiver without upgrading a route to an authorization.
args:
  route: ArchitectureRoute
  declaration: "ArchitectureDeclaration | null"
returns: boolean
---
Compare route receipt, source, revision and service name exactly. The declaration must include the resolved protocol and match the receiver class and creator scoping. Return false if any differs or the declaration is missing.
