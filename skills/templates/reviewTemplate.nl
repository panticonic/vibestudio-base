---
description: Review a Vibestudio template, workspace update, authoring publication, or inter-workspace transfer using caller-owned receipts.
uses: [templateRole, templateRemedy, summarize]
args:
  request: TemplateLifecycleRequest
returns: TemplateLifecycleReport
---
Use the typed kind to choose the work. On inspect, call templateRole with the immutable inspection and summarize.summarize with that inspection and role. On recover, call templateRemedy with the actual error. Otherwise call planWorkspace, reviewUpdate, reviewPublication, or reviewTransfer on the assigned input. Keep the original typed output. Assess the next supported step only. This program does not create a workspace, apply a merge, send a notice, or publish.
