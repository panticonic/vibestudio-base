/**
 * Typed eval services for natlang programs.
 *
 * `serviceDeclarations` is the TypeScript text a model reads about each service
 * (generated from the service contracts; see `catalog.ts`), and
 * `selectServices` builds the matching narrowed runtime objects from the eval
 * bindings. natlang's `createNatlangRuntime({ services, serviceDeclarations })`
 * takes the two side by side.
 */
import { generatedServiceDeclarations } from "./serviceDeclarations.generated.js";

export { SERVICE_CATALOG, SERVICE_NAMES, type ServiceName } from "./catalog.js";
export { selectServices, type NatlangService, type ServiceBindings } from "./select.js";

/** Declaration text per service name: the members of `declare namespace <name> { ... }`. */
export const serviceDeclarations: Readonly<Record<string, string>> = generatedServiceDeclarations;
