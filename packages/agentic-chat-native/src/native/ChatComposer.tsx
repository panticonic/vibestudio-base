import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ChatComposerView } from "../model/composer.js";
import type { ChatNativeTheme } from "./theme.js";
import { radius, spacing } from "./skin.js";

export interface ChatComposerProps {
  theme: ChatNativeTheme;
  value: string;
  view: ChatComposerView;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function ChatComposer({ theme, value, view, onChange, onSend }: ChatComposerProps) {
  return (
    <View style={[styles.bar, { borderTopColor: theme.borderSubtle, backgroundColor: theme.background }]}>
      {view.disabledReason ? (
        <Text style={[styles.hint, { color: theme.warning }]}>{view.disabledReason}</Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          multiline
          value={value}
          onChangeText={onChange}
          accessibilityLabel="Message"
          placeholder="Message"
          placeholderTextColor={theme.textTertiary}
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceRaised },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view.actionLabel}
          accessibilityState={{ disabled: !view.canSend }}
          disabled={!view.canSend}
          onPress={onSend}
          style={[
            styles.send,
            { backgroundColor: theme.accent },
            view.canSend ? null : { opacity: 0.4 },
          ]}
        >
          <Text style={styles.sendLabel}>{view.intent === "send" ? "Send" : view.intent === "steer" ? "Steer" : "Queue"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.sm, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  hint: { fontSize: 12 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  send: {
    minHeight: 44,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  sendLabel: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
