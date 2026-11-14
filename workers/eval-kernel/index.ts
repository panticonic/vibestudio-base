export { EvalKernel } from "./EvalKernel.js";
export type * from "./contract.js";

export default {
  fetch(_req: Request) {
    return new Response("eval kernel DO service");
  },
};
