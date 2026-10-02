import { Button, Flex, IconButton, Spinner, Text } from "@radix-ui/themes";
import type { useDictation } from "../hooks/useDictation";

export function DictationButton({
  dictation,
  disabled,
  size,
}: {
  dictation: ReturnType<typeof useDictation>;
  disabled: boolean;
  size: "2" | "3";
}) {
  if (!dictation.supported) return null;
  const recording = dictation.phase === "recording";
  const label = recording
    ? "Stop dictation"
    : dictation.busy
      ? "Cancel dictation"
      : "Dictate in English";
  return (
    <IconButton
      className="dictation-button"
      type="button"
      size={size}
      variant="soft"
      color={recording ? "red" : "gray"}
      disabled={disabled || dictation.phase === "error"}
      aria-label={label}
      title={`${label} · Offline model in your workspace`}
      onClick={() => {
        if (recording) dictation.stop();
        else if (dictation.busy) dictation.cancel();
        else void dictation.start();
      }}
    >
      {recording ? (
        <span aria-hidden="true">■</span>
      ) : dictation.busy ? (
        <Spinner />
      ) : (
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </svg>
      )}
    </IconButton>
  );
}
export function DictationStatus({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  if (!dictation.message) return null;
  return (
    <Flex
      gap="2"
      align="center"
      mt="1"
      wrap="wrap"
      role={dictation.phase === "error" ? "alert" : "status"}
    >
      <Text size="1" color={dictation.phase === "error" ? "red" : "gray"}>
        {dictation.message}
      </Text>
      {dictation.phase === "recording" && (
        <Button size="1" variant="soft" onClick={dictation.stop}>
          Stop
        </Button>
      )}
      {dictation.phase === "error" && dictation.retry && (
        <Button size="1" variant="soft" onClick={dictation.retry}>
          Retry
        </Button>
      )}
      <Button size="1" variant="ghost" onClick={dictation.cancel}>
        {dictation.phase === "error" ? "Dismiss" : "Cancel"}
      </Button>
    </Flex>
  );
}
