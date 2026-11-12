import { systemTestRunnerRpcMethods } from "@vibestudio/service-schemas/systemTestRunner";
import { localModelsExtensionMethods } from "@workspace/model-catalog/localModels";
import { SERVICE_CATALOG, SERVICE_NAMES, type ServiceName } from "./catalog.js";

/** The eval bindings (`gad`, `vcs`, `services`, `rpc`, `agent`, ...) a program may draw services from. */
export type ServiceBindings = Readonly<Record<string, unknown>>;

type ServiceMethod = (...args: never[]) => Promise<unknown>;

/** The object a natlang program receives: only the methods its declaration lists. */
export type NatlangService = Readonly<Record<string, ServiceMethod>>;

const LOCAL_MODELS_EXTENSION = "@workspace-extensions/local-models";

function entryFor(name: ServiceName) {
  const entry = SERVICE_CATALOG.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`natlang service "${name}" is not in the catalog`);
  return entry;
}

function requireBinding(service: ServiceName, bindings: ServiceBindings, binding: string): unknown {
  const value = bindings[binding];
  if (value === undefined || value === null) {
    const needsAgent = "requiresAgent" in entryFor(service);
    throw new Error(
      `natlang service "${service}" needs the eval binding \`${binding}\`, which is not available in this eval` +
        (needsAgent ? `: ${service} is the view of an agent's conversation, and only an agent's eval has one` : "")
    );
  }
  return value;
}

/** A narrowed view of `source`: exactly the methods the service declares, bound to it. */
function expose(service: ServiceName, source: unknown, from: string): NatlangService {
  if (typeof source !== "object" || source === null) {
    throw new Error(`natlang service "${service}" needs ${from}, which is not an object`);
  }
  const exposed: Record<string, ServiceMethod> = {};
  for (const method of entryFor(service).methods) {
    const implementation = (source as Record<string, unknown>)[method.name];
    if (typeof implementation !== "function") {
      throw new Error(`natlang service "${service}": ${from} has no method ${method.name}`);
    }
    exposed[method.name] = ((...args: unknown[]) =>
      (implementation as (...values: unknown[]) => Promise<unknown>).apply(
        source,
        args
      )) as ServiceMethod;
  }
  return Object.freeze(exposed);
}

function binding(name: ServiceName, binding: string = name) {
  return (bindings: ServiceBindings) =>
    expose(name, requireBinding(name, bindings, binding), `the \`${binding}\` binding`);
}

/** Raw host services (`services.fs`, `services.serverLog`): the caller-scoped server boundary. */
function hostService(name: ServiceName) {
  return (bindings: ServiceBindings) => {
    const services = requireBinding(name, bindings, "services") as Record<string, unknown>;
    return expose(name, services[name], `\`services.${name}\``);
  };
}

const builders: Record<ServiceName, (bindings: ServiceBindings) => NatlangService> = {
  serverLog: hostService("serverLog"),
  gad: binding("gad"),
  problemReports: binding("problemReports"),
  localModels: (bindings) => {
    const extensions = requireBinding("localModels", bindings, "extensions") as {
      invoke(extension: string, method: string, args: unknown[]): Promise<unknown>;
    };
    const { method, result } = localModelsExtensionMethods.listModels;
    return Object.freeze({
      // Decoded with the descriptor the local-models skill uses, so malformed
      // wire data stays an error instead of reading as partial availability.
      listModels: async () => result.parse(await extensions.invoke(LOCAL_MODELS_EXTENSION, method, [])),
    });
  },
  templates: binding("templates"),
  credentials: binding("credentials"),
  fs: hostService("fs"),
  vcs: binding("vcs"),
  web: binding("web"),
  memory: binding("memory"),
  addressees: (bindings) => {
    const agent = requireBinding("addressees", bindings, "agent") as {
      addressees(): Promise<unknown>;
    };
    return Object.freeze({ list: () => agent.addressees() });
  },
  systemTests: (bindings) => {
    const rpc = requireBinding("systemTests", bindings, "rpc") as {
      call(target: string, method: unknown, args: unknown[]): Promise<unknown>;
    };
    return Object.freeze({
      inspect: (runnerTargetId: string, runId: string, testName?: string) =>
        rpc.call(runnerTargetId, systemTestRunnerRpcMethods.inspectSystemTestRun, [runId, testName]),
    });
  },
};

/**
 * Build the service record for a natlang program from the caller's eval
 * bindings. Each service is a narrowed view: only the methods its declaration
 * lists exist, and every call goes through the caller's own binding, so the
 * host's authority checks, approvals, and egress rules apply exactly as they
 * do for the agent's own code. A natlang program cannot widen them.
 *
 * Unknown names are refused rather than ignored, so a typo cannot silently
 * leave a program without the service it declared.
 */
export function selectServices(
  bindings: ServiceBindings,
  names: readonly string[]
): Record<string, NatlangService> {
  const known = new Set<string>(SERVICE_NAMES);
  const unknown = [...new Set(names)].filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `unknown natlang service${unknown.length > 1 ? "s" : ""} ${unknown
        .map((name) => `"${name}"`)
        .join(", ")}; available: ${SERVICE_NAMES.join(", ")}`
    );
  }
  const selected: Record<string, NatlangService> = {};
  for (const name of new Set(names) as Set<ServiceName>) {
    selected[name] = builders[name](bindings);
  }
  return selected;
}
