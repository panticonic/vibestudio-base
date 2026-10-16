/**
 * Chrome the launcher draws over the chat: what a trusted host must show in
 * cells the conversation cannot paint (the terminal client's approvals
 * overlay). The chat offers every input event to the surface first, and while
 * the surface presents a view the view replaces the chat screen and receives
 * the keyboard; the conversation stays mounted underneath.
 */
import type { ReactElement } from "react";
import type { InputEvent } from "../model/keys.js";

export interface HostSurfaceSize {
  columns: number;
  rows: number;
}

export interface HostSurfaceState {
  /** Draws the surface in place of the chat screen; null while the surface is closed. */
  view: ((size: HostSurfaceSize) => ReactElement) | null;
  /** One line for the composer's placeholder while the surface is closed (what waits, and the key that opens it). */
  attention: string | null;
}

export interface ChatHostSurface {
  getSnapshot(): HostSurfaceState;
  subscribe(listener: () => void): () => void;
  /** Handle `event` when the surface wants it (always while open, its opening key otherwise); true means the chat must not see it. */
  handleInput(event: InputEvent): boolean;
}
