export const membershipReference: Record<string, string> = {
  manageChannelAgent: `
    const before = await inspect(request);
    const decision = await choose(request, before);
    if (decision === "attach" || decision === "detach") {
      const receipt = await change(request, decision);
      return await reconcile(request, decision, await inspect(request), receipt);
    }
    return await reconcile(request, decision, before, null);
  `,
  inspect: "return await channelAgentRead.read(request);",
  choose: `
    if (before.state === "unavailable" || before.state === "conflict") return "hold";
    if (request.action === "inspect") return "confirm";
    if (request.action === "attach") {
      if (!request.options) return "hold";
      return before.state === "member" ? "confirm" : "attach";
    }
    return before.state === "member" ? "detach" : "confirm";
  `,
  change:
    'return decision === "attach" ? await attach(request) : await detach(request);',
  attach: "return await channelAgentAttach.attach(request, request.options);",
  detach: "return await channelAgentDetach.detach(request);",
  reconcile: `
    const { state, participantId } = observed;
    let status = "held";
    if (decision === "hold") return { status, state, participantId };
    if (request.action === "inspect") return { status: "observed", state, participantId };
    if (decision === "confirm") return { status: "unchanged", state, participantId };
    if (state === "unavailable" || state === "conflict" ||
        (state === "member" && receipt.participantId && receipt.participantId !== participantId)) {
      return { status: "uncertain", state, participantId };
    }
    const matches = request.action === "attach" ? state === "member" && !!participantId : state === "absent";
    if (receipt.outcome === "already" && matches) status = "unchanged";
    if (receipt.outcome === "acknowledged" || receipt.outcome === "uncertain") {
      status = matches ? "applied" : "uncertain";
    }
    return { status, state, participantId };
  `,
};
