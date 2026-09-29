export type AgentDataMode = "fixture" | "live";

import { snapshotDocument } from "@vibestudio/shared/panel/domSnapshot";
export { snapshotDocument } from "@vibestudio/shared/panel/domSnapshot";

declare global {
  interface Window {
    __vibestudioAgentMode?: AgentDataMode;
  }
}

export function createAgentApi(
  environment: {
    document?: Document;
    location?: Pick<Location, "href" | "pathname" | "search" | "hash">;
    modeChanged?: (mode: AgentDataMode) => void;
  } = {},
) {
  let dataMode: AgentDataMode = "live";
  const customStateProviders = new Map<string, () => unknown>();
  const documentOf = () => {
    if (!environment.document)
      throw new Error("This runtime has no document surface");
    return environment.document;
  };
  const agentApi = {
    snapshot() {
      return snapshotDocument(documentOf());
    },
    tree() {
      const document = documentOf();
      return snapshotDocument(document).structure;
    },
    state() {
      return Object.fromEntries(
        [...customStateProviders].map(([key, provider]) => [key, provider()]),
      );
    },
    routes() {
      const location = environment.location;
      if (!location) throw new Error("This runtime has no document location");
      return {
        href: location.href,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      };
    },
    setMode(mode: AgentDataMode) {
      dataMode = mode;
      environment.modeChanged?.(mode);
      return { mode };
    },
    getMode() {
      return dataMode;
    },
    registerStateProvider(key: string, provider: () => unknown) {
      customStateProviders.set(key, provider);
      return () => customStateProviders.delete(key);
    },
  };

  return agentApi;
}

export function exposeAgentApi(
  agentApi: ReturnType<typeof createAgentApi>,
  expose: (
    method: string,
    handler: (...args: any[]) => unknown | Promise<unknown>,
    website: import("@vibestudio/rpc").WebsiteMethodPolicy,
  ) => void,
): void {
  expose("_agent.snapshot", () => agentApi.snapshot(), {
    kind: "closed",
    reason:
      "Document snapshots and agent controls are private to the owning workspace.",
  });
  expose("_agent.tree", () => agentApi.tree(), {
    kind: "closed",
    reason:
      "Document snapshots and agent controls are private to the owning workspace.",
  });
  expose("_agent.state", () => agentApi.state(), {
    kind: "closed",
    reason:
      "Document snapshots and agent controls are private to the owning workspace.",
  });
  expose("_agent.routes", () => agentApi.routes(), {
    kind: "closed",
    reason:
      "Document snapshots and agent controls are private to the owning workspace.",
  });
  expose("_agent.setMode", (mode) => agentApi.setMode(mode as AgentDataMode), {
    kind: "closed",
    reason:
      "Document snapshots and agent controls are private to the owning workspace.",
  });
}
