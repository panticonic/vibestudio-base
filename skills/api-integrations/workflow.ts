import { credentials } from "@workspace/runtime";
import type {
  IntegrationDestination,
  IntegrationObservation,
  IntegrationPlan,
  IntegrationRequest,
} from "./natlang/types.js";

type AssignedDestination = IntegrationDestination & { url: string };

/** Use the caller's existing authority policy for one sealed integration review. */
export function bindIntegrationReview(assignment: {
  goal: string;
  destinations: AssignedDestination[];
}) {
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
  let observed = false;
  let running = false;
  let stopped = false;
  let index = 0;
  let failure: unknown;

  return {
    request,
    lookupFailure: () => failure,
    services: {
      integrationPlanRead: {
        async observe(id: string): Promise<IntegrationPlan> {
          if (id !== operationId || observed)
            throw new Error("Read the assigned integration plan once");
          observed = true;
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
          const destination = destinations[index];
          if (
            !observed ||
            running ||
            stopped ||
            planReceipt !== receipt ||
            destination?.id !== id
          )
            throw new Error(
              "Resolve only the next destination from the assigned integration plan",
            );
          running = true;
          index++;
          const evidence = { id, receipt: `${operationId}:binding:${id}` };
          try {
            const result = await credentials.resolveCredential({
              url: destination.url,
              use: destination.use,
            });
            return result === null
              ? { ...evidence, state: "missing", canRefresh: null }
              : {
                  ...evidence,
                  state: result.lifecycle.state,
                  canRefresh: result.lifecycle.canRefresh,
                };
          } catch (error) {
            failure = error;
            stopped = true;
            return { ...evidence, state: "unverified", canRefresh: null };
          } finally {
            running = false;
          }
        },
      },
    },
  };
}
