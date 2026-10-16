/**
 * @workspace/terminal-chat — the chat for terminals: an Ink app over the
 * shared headless chat core. `runTerminalChat` runs it on a real terminal;
 * `TerminalChatApp` + `ChatRuntime` embed it (tests drive them directly).
 */
export { TerminalChatApp, type TerminalChatProps } from "./app/App.js";
export {
  ChatRuntime,
  type ChatRuntimeSnapshot,
  type Notice,
  type PendingForm,
} from "./runtime/chatRuntime.js";
export type {
  ChatFiles,
  ChatRpc,
  SessionStateStore,
  TerminalChatBootstrap,
} from "./runtime/bootstrap.js";
export type {
  ChatHostSurface,
  HostSurfaceSize,
  HostSurfaceState,
} from "./runtime/hostSurface.js";
export { ProviderSignIn, type SignInState } from "./runtime/providerSignIn.js";
export { runTerminalChat, type TerminalChatIo } from "./node/main.js";
export { mimeTypeFor, nodeChatFiles } from "./node/files.js";
export { key, KeyDecoder, type InputEvent, type KeyEvent } from "./model/keys.js";
