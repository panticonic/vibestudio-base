import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ChatHostPorts } from "@workspace/agentic-core/chat-store";
import { ImagesPortProvider, type ImagesPort } from "@workspace/react";

/**
 * The slice of the host's `ChatHostPorts` the chat UI itself consumes. A host
 * that omits a port gets no corresponding feature (no "Report a problem"
 * action; image assets fail with an explicit error). Components never reach
 * for a panel runtime.
 */
export type ChatHostServices = Pick<ChatHostPorts, "problemReports" | "images">;

// `ChatHostPorts` lives in a package that cannot depend on the runtime, so it
// declares the asset shape itself. These fail to compile if the two diverge.
type ChatImages = NonNullable<ChatHostPorts["images"]>;
export const imagesPortsAgree = {
  toReact: (port: ChatImages): ImagesPort => port,
  toChat: (port: ImagesPort): ChatImages => port,
};

const EMPTY: ChatHostServices = {};
const ChatHostServicesContext = createContext<ChatHostServices>(EMPTY);

export function ChatHostServicesProvider({
  services,
  children,
}: {
  services: ChatHostServices | undefined;
  children?: ReactNode;
}) {
  return createElement(
    ChatHostServicesContext.Provider,
    { value: services ?? EMPTY },
    createElement(ImagesPortProvider, { images: services?.images }, children)
  );
}

export function useChatHostServices(): ChatHostServices {
  return useContext(ChatHostServicesContext);
}
