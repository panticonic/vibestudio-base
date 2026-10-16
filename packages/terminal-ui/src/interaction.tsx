/**
 * What makes a card interactive: controls that take focus (Tab moves between
 * them, Enter or Space presses the focused one) and that a click presses.
 *
 * A click is located with the layout Ink itself computed for drawing the
 * card, so what a click hits is exactly what was drawn there. The host owns
 * one `ClickTargets` per card and asks it what lies under a cell.
 */
import React, { createContext, useContext, useId, useLayoutEffect, useRef } from "react";
import { Box, Text, useFocus, useInput, type DOMElement } from "ink";

interface Target {
  node: DOMElement;
  press: () => void;
}

export class ClickTargets {
  private readonly targets = new Map<string, Target>();

  set(id: string, target: Target): void {
    this.targets.set(id, target);
  }

  delete(id: string, node: DOMElement): void {
    if (this.targets.get(id)?.node === node) this.targets.delete(id);
  }

  /** Press what lies under card-relative cell (x, y); false when nothing does. */
  press(x: number, y: number): boolean {
    for (const target of this.targets.values()) {
      const rect = visibleRect(target.node);
      if (
        rect &&
        x >= rect.x &&
        x < rect.x + rect.width &&
        y >= rect.y &&
        y < rect.y + rect.height
      ) {
        target.press();
        return true;
      }
    }
    return false;
  }
}

export const ClickTargetsContext = createContext<ClickTargets | null>(null);

/**
 * Inside a `<Text>` nothing may be a box, so a control there is text that
 * takes focus but has no cell of its own to click.
 */
export const InlineContext = createContext(false);

export interface PressableProps {
  onPress: () => void;
  disabled?: boolean;
  /** Draws the control; `focused` while it holds the keyboard. */
  children: (focused: boolean) => React.ReactNode;
}

/**
 * Makes the box `ref` is attached to pressable by a click. Inside text there
 * is no box of its own to click, so the ref is unused there.
 */
export function useClickTarget(onPress: () => void, disabled = false) {
  const press = useRef(onPress);
  press.current = onPress;
  const targets = useContext(ClickTargetsContext);
  const id = useId();
  const ref = useRef<DOMElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!targets || !node || disabled) return;
    targets.set(id, { node, press: () => press.current() });
    return () => targets.delete(id, node);
  });
  return ref;
}

/** A box a click presses: for controls that manage their own focus. */
export function Clickable({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const ref = useClickTarget(onPress, disabled);
  if (useContext(InlineContext)) return <>{children}</>;
  return (
    <Box ref={ref} flexShrink={0}>
      {children}
    </Box>
  );
}

/** A control: focusable, pressed by Enter or Space while focused, and by a click. */
export function Pressable({
  onPress,
  disabled = false,
  children,
}: PressableProps): React.ReactElement {
  const { isFocused } = useFocus({ isActive: !disabled });
  const press = useRef(onPress);
  press.current = onPress;
  useInput(
    (input, key) => {
      if (key.return || input === " ") press.current();
    },
    { isActive: isFocused && !disabled }
  );
  return (
    <Clickable onPress={() => press.current()} disabled={disabled}>
      {children(isFocused)}
    </Clickable>
  );
}

export type Tone = "gray" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan";

/** A button's face: a filled block in its tone, brighter while focused. */
export function ButtonFace({
  label,
  tone,
  focused,
  disabled,
}: {
  label: React.ReactNode;
  tone?: Tone | undefined;
  focused: boolean;
  disabled?: boolean | undefined;
}): React.ReactElement {
  if (disabled) return <Text dimColor> {label} </Text>;
  return (
    <Text inverse bold={focused} color={focused ? "cyan" : (tone ?? "gray")}>
      {focused ? "▸" : " "}
      {label}{" "}
    </Text>
  );
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function visibleRect(node: DOMElement): Rect | null {
  const own = absoluteRect(node);
  if (!own) return null;
  let rect = own;
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    const style = parent.style ?? {};
    if (style.overflow !== "hidden" && style.overflowY !== "hidden") continue;
    const clip = absoluteRect(parent);
    if (!clip) return null;
    const y0 = Math.max(rect.y, clip.y);
    const y1 = Math.min(rect.y + rect.height, clip.y + clip.height);
    if (y1 <= y0) return null;
    rect = { ...rect, y: y0, height: y1 - y0 };
  }
  return rect;
}

function absoluteRect(node: DOMElement): Rect | null {
  const yoga = node.yogaNode;
  if (!yoga) return null;
  let x = 0;
  let y = 0;
  for (let at: DOMElement | undefined = node; at; at = at.parentNode) {
    if (!at.yogaNode) continue;
    x += at.yogaNode.getComputedLeft();
    y += at.yogaNode.getComputedTop();
  }
  return { x, y, width: yoga.getComputedWidth(), height: yoga.getComputedHeight() };
}
