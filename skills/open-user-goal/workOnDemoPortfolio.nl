---
description: Judge the readiness of the owned Examples demo portfolio from separate Grimoire and Regency evidence.
budget: { maxTurns: 44 }
args:
  goal: string
returns: PortfolioResult
---
1. Call portfolio.findPortfolio. Use the assigned id to read opening and current native frames separately through portfolio.readPortfolioFrame. Call choosePortfolioCriteria with the goal and both frames.
2. If plan.months names a horizon, call portfolio.readPortfolioForecast with the exact current frame id and those months. Otherwise projection is null.
3. Call reviewPortfolioGarden and reviewPortfolioRealm with both exact frames and the corresponding criterion lists. Give the realm child the same projection. Keep both installed results in order.
4. Call decidePortfolioDelivery with current, plan, both results, and the unchanged goal. Build the exact report with note null. When the decision.write is true, call portfolio.stagePortfolioHandoff and preserve the returned receipt. Keep the actual report for any authorized note.

Finally call applicationResult with projection, garden, realm, decision, note. Return only that actual application result; original observations and execution history remain internal.
