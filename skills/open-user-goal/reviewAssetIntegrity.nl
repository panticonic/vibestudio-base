---
description: Resolve the requested asset identity findings and authorized private recovery from retained native evidence.
args:
  goal: string
returns: AssetIntegrityFinding
---
Work out which asset identity questions and recovery effects the user actually requested. Use the owned version index, relevant retained manifests and independent file readbacks to investigate them. Compare stable file identity, path, exact content digest and mode as separate facts; a reused pathname or equal checksum alone does not establish retained lineage. Use the semantic comparison and recovery-planning hierarchy when useful, retaining its actual observations for later judgments.

Choose the source edition and subset from the user's authority and actual signed manifest, rather than assuming every historical edition is an authorized recovery source. Native staging enforces the exact current working head, approved source and permitted copy scope. Interpret its actual result: a changed head calls for fresh evidence and a decision under the user's revision restriction, not an automatic retry or a claim that a copy exists. A refusal or incomplete source cannot establish recovery. Leave working files and unrequested assets unchanged.

Return the requested factual finding, including limitations or contradictions relevant to the question, and the genuine private recovery receipt when one was actually issued. Use null for a finding that the user did not request or an absent recovery. Do not substitute a report for requested retained bytes, or omit requested questions merely because recovery succeeded.
