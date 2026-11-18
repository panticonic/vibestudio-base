---
description: Compare callable signatures, authority and topology against the assigned contract.
args:
  contract: AuthoringContract
  candidate: CompiledProgram
  baseline: CompiledProgram | null
returns: AuthoringFinding[]
---
Read the intended entry, services and helper paths from the contract. Call checkSignature, checkServices and checkTopology independently. Return their findings in that order. If preserveBaseline is true, baseline protects the selected entry signature and declared services when the corresponding explicit expected values are absent. Only the requested helper paths are required.
