export { ModelGatewayDO } from "./ModelGatewayDO.js";

export default {
  async fetch() {
    return new Response(
      "Model gateway service.\nMethods: turn, cancel.\n",
      { headers: { "Content-Type": "text/plain" } },
    );
  },
};
