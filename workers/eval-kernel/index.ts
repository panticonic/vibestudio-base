// The realm is locked down before anything else in this isolate loads (§7.6).
import "@vibestudio/shared/kernelRealm";

export { EvalKernel } from "./EvalKernel.js";
export type * from "./contract.js";

export default {
  fetch(_req: Request) {
    return new Response("eval kernel DO service");
  },
};
