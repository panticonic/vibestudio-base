import { credentials } from "@workspace/runtime";
import type {
  IntegrationDestination,
  IntegrationObservation,
  IntegrationPlan,
  IntegrationRequest,
} from "./natlang/types.js";

type AssignedDestination = IntegrationDestination & { url: string };

type ResolveIntegrationDestination = (input: {id:string;url:string;use:IntegrationDestination["use"]}) => Promise<{
  lifecycle: {state:"active"|"expired"|"revoked";canRefresh:boolean};
} | null>;

/** Use the caller's existing authority policy for one sealed integration review. */
export function bindIntegrationReview(
  assignment: {goal:string;destinations:AssignedDestination[]},
  resolveDestination: ResolveIntegrationDestination = ({url,use}) => credentials.resolveCredential({url,use}),
) {
  const destinations = structuredClone(assignment.destinations);
  const ids = new Set(destinations.map(({ id }) => id));
  if (
    ids.size !== destinations.length ||
    ids.has("") ||
    !destinations.some(({ required }) => required)
  )
    throw new Error(
      "Assign distinct destination IDs and at least one required destination",
    );
  for (const { url } of destinations) {
    const parsed = new URL(url);
    if (
      !["http:", "https:", "ssh:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Use a destination URL without embedded credentials");
  }
  const operationId = crypto.randomUUID();
  const receipt = `${operationId}:integration`;
  const request: IntegrationRequest = { goal: assignment.goal, operationId };
  let stopped = false;
  let failure: unknown;
  const observations = new Map<string, Promise<IntegrationObservation>>();
  let pending: Promise<unknown> = Promise.resolve();

  return {
    request,
    lookupFailure: () => failure,
    services: {
      integrationPlanRead: {
        async observe(id: string): Promise<IntegrationPlan> {
          if (id !== operationId)
            throw new Error("Read the assigned integration plan");
          return {
            receipt,
            destinations: destinations.map(
              ({ id, purpose, use, required }) => ({
                id,
                purpose,
                use,
                required,
              }),
            ),
          };
        },
      },
      integrationCredentialLookup: {
        async resolve(
          planReceipt: string,
          id: string,
        ): Promise<IntegrationObservation> {
          const destination = destinations.find(item => item.id === id);
          if (planReceipt !== receipt || !destination)
            throw new Error("Resolve a destination from the assigned integration plan");
          const previous = observations.get(id);
          if (previous) return structuredClone(await previous);
          const observing = pending.then(async (): Promise<IntegrationObservation> => {
            if (stopped) throw new Error("Authorization remains unverified; additional destinations are held");
            const evidence = { id, receipt: `${operationId}:binding:${id}` };
            try {
              const result = await resolveDestination({ id, url: destination.url, use: destination.use });
              return result === null
                ? { ...evidence, state: "missing", canRefresh: null }
                : { ...evidence, state: result.lifecycle.state, canRefresh: result.lifecycle.canRefresh };
            } catch (error) {
              failure = error;
              stopped = true;
              return { ...evidence, state: "unverified", canRefresh: null };
            }
          });
          observations.set(id, observing);
          pending = observing.then(() => undefined, () => undefined);
          return structuredClone(await observing);
        },
      },
    },
  };
}
