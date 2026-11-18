declare module "natlang:services" {
  export namespace channelAgentRead {
    function read(
      request: import("./types.js").ChannelAgentRequest,
    ): Promise<import("./types.js").RosterObservation>;
  }
  export namespace channelAgentAttach {
    function attach(
      request: import("./types.js").ChannelAgentRequest,
      options: import("./types.js").AttachOptions,
    ): Promise<import("./types.js").MembershipReceipt>;
  }
  export namespace channelAgentDetach {
    function detach(
      request: import("./types.js").ChannelAgentRequest,
    ): Promise<import("./types.js").MembershipReceipt>;
  }
}
