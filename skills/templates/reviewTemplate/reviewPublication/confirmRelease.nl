---
description: Distinguish a durable release receipt from a mismatched or partial publication.
args:
  receipt: { operationId:string; url:string; commit:string; snapshot:string; matches:boolean }
returns: "published" | "reconcile-receipt"
readout: decision
---
Return published only when matches is true and both the commit and snapshot identities, URL, and operation ID are present in the receipt. Otherwise return reconcile-receipt. Never suggest repeating an ambiguous publication under a new command.
