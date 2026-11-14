export { SessionDO } from "./SessionDO.js";

export default {
  fetch(_req: Request) {
    return new Response("session DO service");
  },
};
