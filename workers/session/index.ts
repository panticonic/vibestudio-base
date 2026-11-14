export { SessionDO, SESSION_KERNEL_SOURCE, SESSION_KERNEL_CLASS } from "./SessionDO.js";

export default {
  fetch(_req: Request) {
    return new Response("session DO service");
  },
};
