import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { QuickfireSessionsDO } from "./index.js";

type Receiver = Pick<QuickfireSessionsDO, "sessionFor" | "clear" | "promote" | "list">;
export const quickfireRpcMethods = createReceiverRpcMethods<Receiver>(["sessionFor", "clear", "promote", "list"]);
