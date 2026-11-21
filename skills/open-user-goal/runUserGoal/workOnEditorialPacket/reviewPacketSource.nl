---
description: Read and attest approved original local attachment evidence for the selected fields.
args:
  goal: string
  snapshot: PacketSnapshot
  plan: PacketPlan
returns: PacketSource
---
Call chooseAttachmentPages with goal, snapshot and plan. If it returns null, return all fields null. Otherwise call packet.bindPacketPdf with the exact selection and preserve its request. If no request was bound, keep pdf and evidence null. Call pdf.extractPdfEvidence with the exact request. Pass the actual result to packet.attestPacketPdf. Return the selection, request, PDF result, and exact attestation unchanged.
