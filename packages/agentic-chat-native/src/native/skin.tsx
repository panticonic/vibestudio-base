/**
 * React Native views for the quickfire skin contract
 * (`@workspace/quickfire-core/ui`), so the chat transcript draws the same
 * component tree the desktop overlay and the mobile sheet do.
 *
 * Two React Native facts shape it: Text may only nest Text (an inline
 * `Pressable variant="quiet"` is a `<Text onPress>`, and the skin supplies no
 * inline `Image`, so the renderer falls back to alt text), and there is no
 * cascade (every tone resolves through one table). Icons are text glyphs: the
 * package adds no icon dependency to the RN bundle.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { QuickfireTone } from "@workspace/quickfire-core";
import type {
  QuickfireBoxProps,
  QuickfireCodeProps,
  QuickfireDisclosureProps,
  QuickfireFigureProps,
  QuickfireIconProps,
  QuickfireInputProps,
  QuickfirePressableProps,
  QuickfireSkin,
  QuickfireSpace,
  QuickfireTableProps,
  QuickfireTextProps,
} from "@workspace/quickfire-core/ui";
import type { ChatNativeTheme } from "./theme.js";

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
const hairline = StyleSheet.hairlineWidth;

const GLYPHS: Record<QuickfireIconProps["name"], string> = {
  search: "⌕",
  copy: "⧉",
  expand: "⇕",
  collapse: "⇱",
  you: "●",
  agent: "✦",
  person: "●",
  spark: "✦",
  tool: "⚒",
  check: "✓",
  cross: "✕",
  alert: "⚠",
  info: "ⓘ",
  clock: "◷",
  reasoning: "∴",
  card: "▣",
  paperclip: "⎘",
  bell: "♪",
  gavel: "⚖",
};

const SPACE: Record<QuickfireSpace, number> = {
  none: 0,
  xs: spacing.xxs,
  sm: spacing.xs,
  md: spacing.sm,
  lg: spacing.lg,
};

interface Tone {
  fg: string;
  wash: string;
  edge: string;
}

function withAlpha(color: string, hex: string): string {
  return /^#[0-9a-f]{6}$/iu.test(color) ? `${color}${hex}` : color;
}

function toneTable(colors: ChatNativeTheme): Record<QuickfireTone | "muted", Tone> {
  const status = (fg: string, wash: string): Tone => ({ fg, wash, edge: withAlpha(fg, "55") });
  return {
    neutral: { fg: colors.text, wash: colors.surfaceSunken, edge: colors.borderSubtle },
    muted: { fg: colors.textSecondary, wash: colors.surfaceSunken, edge: colors.borderSubtle },
    accent: status(colors.accent, colors.accentSoft),
    success: status(colors.success, colors.successSoft),
    warning: status(colors.warning, colors.warningSoft),
    danger: status(colors.danger, colors.dangerSoft),
    info: status(colors.info, colors.infoSoft),
    reasoning: status(colors.accent, withAlpha(colors.accent, "1f")),
  };
}

export interface ChatNativeSkinOptions {
  /** Open a destination from agent prose. Required: the client decides whether a link is in-app. */
  openLink: (href: string) => void;
  /** Put text on the clipboard. Absent: the copy affordance is not offered by the host. */
  copy?: (text: string) => void | Promise<void>;
}

/** Build the skin for one palette. Memoize per theme: a new identity remounts the transcript. */
export function createChatNativeSkin(
  colors: ChatNativeTheme,
  options: ChatNativeSkinOptions
): QuickfireSkin {
  const tones = toneTable(colors);
  const toneOf = (name: QuickfireTone | "muted" | undefined): Tone =>
    tones[name ?? "neutral"] ?? tones.neutral;
  const FitExpansion = createContext<((open: boolean) => void) | null>(null);

  function FitBox({
    children,
    style,
    testId,
    live,
  }: {
    children: ReactNode;
    style: ViewStyle;
    testId?: string;
    live?: boolean;
  }) {
    const [expanded, setExpanded] = useState(false);
    return (
      <View
        style={[
          style,
          expanded
            ? { alignSelf: "stretch", width: "100%" }
            : { alignSelf: "flex-start", maxWidth: "100%" },
        ]}
        testID={testId}
        {...(live ? { accessibilityLiveRegion: "polite" as const } : {})}
      >
        <FitExpansion.Provider value={setExpanded}>{children}</FitExpansion.Provider>
      </View>
    );
  }

  function padding(pad: QuickfireSpace | undefined): ViewStyle {
    if (!pad || pad === "none") return {};
    if (pad === "xs") return { padding: SPACE.xs };
    if (pad === "sm") return { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md };
    if (pad === "md") return { paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg };
    return { padding: SPACE.lg };
  }

  function surfaceStyle(surface: QuickfireBoxProps["surface"], tone: Tone): ViewStyle {
    switch (surface) {
      case "answer":
        return {
          backgroundColor: colors.surfaceRaised,
          borderWidth: hairline,
          borderColor: colors.borderSubtle,
          borderRadius: radius.lg,
        };
      case "card":
        return {
          backgroundColor: tone.wash,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderWidth: hairline,
          borderColor: tone.edge,
        };
      case "sunken":
        return { backgroundColor: colors.surfaceSunken, borderRadius: radius.md };
      case "outline":
        return {
          borderWidth: hairline,
          borderColor: tone.edge,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceRaised,
          overflow: "hidden",
        };
      case "rail":
        return {
          borderLeftWidth: 2,
          borderLeftColor: tone.edge,
          backgroundColor: tone.wash,
          borderTopRightRadius: radius.md,
          borderBottomRightRadius: radius.md,
          paddingLeft: spacing.sm,
        };
      default:
        return {};
    }
  }

  function Box({
    children,
    gap,
    pad,
    row,
    surface,
    tone,
    align,
    grow,
    full,
    fit,
    scroll,
    testId,
    live,
    emphasis,
    // A phone has no pointer to reveal secondary controls with: always visible.
    hover: _hover,
  }: QuickfireBoxProps) {
    const resolved = toneOf(tone);
    const style: ViewStyle = {
      flexDirection: row ? "row" : "column",
      ...(row ? { flexWrap: "wrap" } : {}),
      ...(gap ? { gap: SPACE[gap] } : {}),
      ...(align === "center"
        ? { alignItems: "center" }
        : align === "baseline"
          ? { alignItems: "baseline" }
          : {}),
      ...(grow ? { flex: 1, minWidth: 0 } : {}),
      ...(full ? { width: "100%" } : {}),
      ...(scroll ? { overflow: "scroll" } : {}),
      ...padding(pad),
      ...surfaceStyle(surface, resolved),
      ...(emphasis ? { borderWidth: 1, borderColor: resolved.edge, borderRadius: radius.md } : {}),
    };
    return fit ? (
      <FitBox style={style} {...(testId ? { testId } : {})} {...(live ? { live: true } : {})}>
        {children}
      </FitBox>
    ) : (
      <View
        style={style}
        testID={testId}
        {...(live ? { accessibilityLiveRegion: "polite" as const } : {})}
      >
        {children}
      </View>
    );
  }

  function textStyle(variant: QuickfireTextProps["variant"]): TextStyle {
    switch (variant) {
      case "strong":
        return { fontSize: 15, lineHeight: 21, fontWeight: "700" };
      case "emphasis":
        return { fontSize: 15, lineHeight: 21, fontStyle: "italic" };
      case "strike":
        return { fontSize: 15, lineHeight: 21, textDecorationLine: "line-through" };
      case "heading":
        return { fontSize: 18, lineHeight: 24, fontWeight: "700" };
      case "label":
        return { fontSize: 11, lineHeight: 14, fontWeight: "600", textTransform: "uppercase" };
      case "caption":
        return { fontSize: 12, lineHeight: 16 };
      case "code":
        return { fontFamily: monospaceFamily(), fontSize: 13 };
      default:
        return { fontSize: 15, lineHeight: 21 };
    }
  }

  function Text({ children, variant, tone, clamp, selectable, testId }: QuickfireTextProps) {
    return (
      <RNText
        testID={testId}
        selectable={selectable}
        numberOfLines={clamp ? 1 : undefined}
        style={[
          textStyle(variant),
          { color: tone ? toneOf(tone).fg : colors.text },
          variant === "code" ? { backgroundColor: colors.codeBackground } : null,
        ]}
      >
        {children}
      </RNText>
    );
  }

  function Pressable({
    children,
    onPress,
    label,
    variant = "ghost",
    tone,
    disabled,
    testId,
  }: QuickfirePressableProps) {
    const resolved = toneOf(tone);
    if (variant === "quiet") {
      // Inline inside running prose: it must be a Text or the paragraph breaks.
      return (
        <RNText
          accessibilityRole="link"
          accessibilityLabel={label}
          testID={testId}
          onPress={disabled ? undefined : onPress}
          style={{ color: resolved.fg, textDecorationLine: "underline" }}
        >
          {children}
        </RNText>
      );
    }
    return (
      <RNPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        testID={testId}
        hitSlop={6}
        style={({ pressed }) => [
          styles.press,
          variant === "primary"
            ? { borderWidth: 1, borderColor: resolved.edge, paddingHorizontal: spacing.md }
            : null,
          pressed ? { backgroundColor: resolved.wash } : null,
          disabled ? { opacity: 0.42 } : null,
        ]}
      >
        {children}
      </RNPressable>
    );
  }

  function Icon({ name, tone, size = "md" }: QuickfireIconProps) {
    return (
      <RNText
        accessible={false}
        style={{ color: toneOf(tone).fg, fontSize: size === "sm" ? 12 : 14 }}
      >
        {GLYPHS[name] ?? GLYPHS.info}
      </RNText>
    );
  }

  function Spinner({ tone }: { tone?: QuickfireTone }) {
    return <ActivityIndicator size="small" color={toneOf(tone).fg} />;
  }

  function Divider() {
    return <View style={[styles.rule, { backgroundColor: colors.borderSubtle }]} />;
  }

  function Pill({ children, tone }: { children?: ReactNode; tone?: QuickfireTone }) {
    const resolved = toneOf(tone);
    return (
      <View style={[styles.pill, { backgroundColor: resolved.wash, borderColor: resolved.edge }]}>
        <RNText style={[textStyle("label"), { color: resolved.fg }]}>{children}</RNText>
      </View>
    );
  }

  function Disclosure({
    summary,
    children,
    defaultOpen,
    open: controlledOpen,
    onOpenChange,
    tone,
    label,
    testId,
  }: QuickfireDisclosureProps) {
    const [localOpen, setLocalOpen] = useState(defaultOpen === true);
    const open = controlledOpen ?? localOpen;
    const setFitExpanded = useContext(FitExpansion);
    useEffect(() => {
      setFitExpanded?.(open);
      return () => setFitExpanded?.(false);
    }, [open, setFitExpanded]);
    const resolved = toneOf(tone);
    return (
      <View testID={testId}>
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel={`${open ? "Hide" : "Show"} ${label}`}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            if (onOpenChange) onOpenChange(!open);
            else setLocalOpen(!open);
          }}
          hitSlop={4}
          style={styles.disclosureSummary}
        >
          <RNText style={[textStyle("label"), { color: resolved.fg }]}>{open ? "▾" : "▸"}</RNText>
          <View style={{ flex: 1, minWidth: 0 }}>{summary}</View>
        </RNPressable>
        {open ? <View style={styles.disclosureBody}>{children}</View> : null}
      </View>
    );
  }

  function Code({ text, language, caption }: QuickfireCodeProps) {
    const [copied, setCopied] = useState(false);
    const [wrapped, setWrapped] = useState(true);
    const lines = text.split("\n").length;
    const label = language === "mermaid" ? "Diagram source" : (caption ?? language ?? "Text");
    return (
      <View style={[styles.code, { borderColor: colors.borderSubtle }]}>
        <View
          style={[
            styles.codeBar,
            { borderBottomColor: colors.borderSubtle, backgroundColor: colors.surfaceSunken },
          ]}
        >
          <RNText style={[textStyle("caption"), { color: colors.textSecondary }]}>
            {label} · {lines} {lines === 1 ? "line" : "lines"}
          </RNText>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <RNPressable
              style={styles.codeAction}
              accessibilityRole="button"
              accessibilityLabel="Wrap code lines"
              accessibilityState={{ selected: wrapped }}
              onPress={() => setWrapped(!wrapped)}
            >
              <RNText
                style={[
                  textStyle("caption"),
                  { color: wrapped ? colors.accent : colors.textSecondary },
                ]}
              >
                Wrap
              </RNText>
            </RNPressable>
            {options.copy ? (
              <RNPressable
                style={styles.codeAction}
                accessibilityRole="button"
                accessibilityLabel={copied ? "Copied" : "Copy this block"}
                onPress={() => {
                  void Promise.resolve(options.copy?.(text)).then(
                    () => setCopied(true),
                    () => setCopied(false)
                  );
                }}
              >
                <RNText style={[textStyle("caption"), { color: colors.accent }]}>
                  {copied ? "Copied" : "Copy"}
                </RNText>
              </RNPressable>
            ) : null}
          </View>
        </View>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
          <ScrollView horizontal={!wrapped} nestedScrollEnabled>
            <RNText
              selectable
              style={[
                styles.codeText,
                { color: colors.text, backgroundColor: colors.codeBackground },
              ]}
            >
              {text}
            </RNText>
          </ScrollView>
        </ScrollView>
      </View>
    );
  }

  function Table({ head, rows, align }: QuickfireTableProps) {
    return (
      <View testID="chat-table" style={[styles.code, { borderColor: colors.borderSubtle }]}>
        <ScrollView horizontal nestedScrollEnabled accessibilityLabel="Data table">
          <View>
            {[head, ...rows].map((row, index) => (
              <View
                key={index}
                style={{
                  flexDirection: "row",
                  backgroundColor: index === 0 ? colors.surfaceSunken : colors.surfaceRaised,
                }}
              >
                {row.map((cell, column) => (
                  <View
                    key={column}
                    style={{
                      width: 160,
                      padding: spacing.md,
                      borderTopWidth: hairline,
                      borderColor: colors.borderSubtle,
                    }}
                  >
                    <RNText
                      accessibilityRole={index === 0 ? "header" : undefined}
                      style={{ color: colors.text, textAlign: align[column] ?? "left" }}
                    >
                      {cell}
                    </RNText>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  function Figure({ src, alt, caption }: QuickfireFigureProps) {
    return (
      <View style={[styles.figure, { borderColor: colors.borderSubtle }]}>
        <RNImage
          source={{ uri: src }}
          accessibilityLabel={alt}
          resizeMode="contain"
          style={styles.figureImage}
        />
        {caption ? (
          <RNText
            style={[textStyle("label"), styles.figureCaption, { color: colors.textTertiary }]}
          >
            {caption}
          </RNText>
        ) : null}
      </View>
    );
  }

  /** No blink: an animated cursor on a phone costs a frame loop for a hint. */
  function Caret() {
    return <RNText style={{ color: colors.accent }}>▌</RNText>;
  }

  function Input({ value, onChange, label, placeholder }: QuickfireInputProps) {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: 44,
          borderWidth: hairline,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          color: colors.text,
          fontSize: 16,
        }}
      />
    );
  }

  return {
    Table,
    Input,
    Box,
    Text,
    Pressable,
    Icon,
    Spinner,
    Divider,
    Pill,
    Disclosure,
    Code,
    Figure,
    Caret,
    openUrl: options.openLink,
    ...(options.copy ? { copy: options.copy } : {}),
  };
}

export function useChatNativeSkin(colors: ChatNativeTheme, options: ChatNativeSkinOptions): QuickfireSkin {
  const { openLink, copy } = options;
  return useMemo(() => createChatNativeSkin(colors, { openLink, ...(copy ? { copy } : {}) }), [colors, openLink, copy]);
}

const styles = StyleSheet.create({
  press: {
    minHeight: 44,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  rule: { height: hairline, width: "100%", marginVertical: spacing.xs },
  pill: {
    borderWidth: hairline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  disclosureSummary: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  disclosureBody: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  code: { borderWidth: hairline, borderRadius: radius.md, overflow: "hidden" },
  codeAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  codeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: hairline,
  },
  figure: { borderWidth: hairline, borderRadius: radius.md, overflow: "hidden" },
  figureImage: { width: "100%", height: 200 },
  figureCaption: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  codeText: { fontFamily: monospaceFamily(), fontSize: 12, lineHeight: 17, padding: spacing.sm },
});

function monospaceFamily(): string | undefined {
  return Platform.select({ ios: "Menlo", android: "monospace" });
}
