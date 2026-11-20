---
description: Reconcile current trusted API integration selection and authorized quiet binding readiness.
budget: { maxTurns: 34 }
args:
  goal: string
returns: ApiReadinessReport
---
1. Discover current profiles. Choose the exact intended integration and read the owned selection frontier twice. Call checkIntegrationSelection with both views.
2. Only if its current trusted selection is selected, call workspace.openQuietIntegrationPlan using the exact profile and message. Call reviewQuietCredentials with its request. Then read workspace.readQuietIntegrationAudit with the same operation ID. Otherwise use null review and audit.
3. Call decideApiReadiness with unchanged goal and all observed evidence. Form the exact report with plan, review, audit and null handoff. If stage is allowed, put the exact returned receipt in the handoff field and return the same report. Otherwise return the report with null handoff.
