import { createExtensionRpcMethods, createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { Api } from "./index.js";
export const imageServiceRpcMethods = createExtensionRpcMethods("@workspace-extensions/image-service", createReceiverRpcMethods<Pick<Api, "getMetadata">>(["getMetadata"]));
