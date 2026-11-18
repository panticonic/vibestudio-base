import type {
  AttachOptions,
  ChannelAgentRequest,
  MembershipReceipt,
  RosterObservation,
} from "./channel-membership/types.js";

export type ChannelMembershipPorts = {
  roster(): Promise<RosterObservation>;
  add(options: AttachOptions): Promise<MembershipReceipt>;
  remove(): Promise<MembershipReceipt>;
};

function sameOptions(
  left: AttachOptions | null,
  right: AttachOptions | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.replay === right.replay &&
    left.response === right.response &&
    left.modelRef === right.modelRef
  );
}

function receipt(outcome: MembershipReceipt["outcome"]): MembershipReceipt {
  return { outcome, participantId: null };
}

/** Bind one action. Reconcile through a new roster read if its outcome is unknown. */
export function bindChannelMembership(
  assignment: ChannelAgentRequest,
  ports: ChannelMembershipPorts,
): {
  channelAgentRead: {
    read(request: ChannelAgentRequest): Promise<RosterObservation>;
  };
  channelAgentAttach: {
    attach(
      request: ChannelAgentRequest,
      options: AttachOptions,
    ): Promise<MembershipReceipt>;
  };
  channelAgentDetach: {
    detach(request: ChannelAgentRequest): Promise<MembershipReceipt>;
  };
} {
  const scope = {
    ...assignment,
    options: assignment.options && { ...assignment.options },
  };
  let claimed = false;

  function assertScope(request: ChannelAgentRequest): void {
    if (
      request.channelId !== scope.channelId ||
      request.contextId !== scope.contextId ||
      request.handle !== scope.handle ||
      request.action !== scope.action ||
      !sameOptions(request.options, scope.options)
    ) {
      throw new Error(
        "Channel agent request does not match the assigned membership action.",
      );
    }
  }

  async function read(
    request: ChannelAgentRequest,
  ): Promise<RosterObservation> {
    assertScope(request);
    try {
      return await ports.roster();
    } catch {
      return { state: "unavailable", participantId: null };
    }
  }

  async function change(
    request: ChannelAgentRequest,
    intended: "attach" | "detach",
    perform: () => Promise<MembershipReceipt>,
  ): Promise<MembershipReceipt> {
    assertScope(request);
    if (claimed || scope.action !== intended) return receipt("blocked");
    claimed = true;
    const current = await read(request);
    if (current.state === "conflict" || current.state === "unavailable") {
      return receipt("blocked");
    }
    if ((intended === "attach") === (current.state === "member")) {
      return { outcome: "already", participantId: current.participantId };
    }
    try {
      return await perform();
    } catch {
      return receipt("uncertain");
    }
  }

  return {
    channelAgentRead: { read },
    channelAgentAttach: {
      async attach(request, options) {
        assertScope(request);
        const assigned = scope.options;
        if (!assigned || !sameOptions(assigned, options))
          return receipt("blocked");
        return change(request, "attach", () => ports.add({ ...assigned }));
      },
    },
    channelAgentDetach: {
      detach: (request) => change(request, "detach", ports.remove),
    },
  };
}
