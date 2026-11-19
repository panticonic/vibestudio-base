---
description: Interpret a host credential observation without exposing credential data.
args:
  observation: IntegrationObservation
returns: DestinationDisposition
---
Map active to ready. Map missing to setup-needed. Map expired or revoked to renewal-needed. Map unverified to authorization-unverified. An unverified lookup cannot establish that a credential is missing.
