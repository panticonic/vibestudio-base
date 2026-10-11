/** Descriptor-based RPC operations needed by panel handles. */
export type PanelRuntimeRpc = Pick<
  import("@vibestudio/rpc").RpcClient,
  "call" | "on" | "emit"
>;
