import {
  Button,
  Flex,
  IconButton,
  Progress,
  Spinner,
  Text,
} from "@radix-ui/themes";
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
  const preparing =
    dictation.phase === "loading" || dictation.phase === "checking";
  const active = dictation.busy || preparing;
  const label = recording
    ? "Stop dictation"
    : active
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
        else if (active) dictation.cancel();
        else void dictation.start();
      }}
    >
      {recording ? (
        <span aria-hidden="true">■</span>
      ) : active ? (
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
export function DictationStatus({
  dictation,
}: {
  dictation: ReturnType<typeof useDictation>;
}) {
  if (!dictation.message) return null;
  const phase = dictation.phase;
  const loading = phase === "loading" || phase === "checking";
  return (
    <Flex
      className="dictation-status"
      direction="column"
      gap="2"
      role={phase === "error" ? "alert" : "status"}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        right: 0,
        maxWidth: "min(420px, 100%)",
        padding: "12px 14px",
        zIndex: 20,
        borderRadius: "var(--radius-3)",
        border: "1px solid var(--gray-6)",
        background: "var(--color-panel-solid)",
        boxShadow: "var(--shadow-4)",
      }}
    >
      <Flex gap="2" align="center">
        {loading && <Spinner size="1" />}
        <Text size="2" color={phase === "error" ? "red" : undefined}>
          {dictation.message}
        </Text>
      </Flex>
      {phase === "loading" && (
        <Progress
          value={dictation.loadProgress ?? null}
          aria-label="Loading voice model"
        />
      )}
      <Flex gap="2" align="center" wrap="wrap">
        {phase === "offer" && (
          <Button size="1" onClick={() => void dictation.prepare()}>
            Load voice input
          </Button>
        )}
        {phase === "ready" && (
          <Button size="1" onClick={() => void dictation.start()}>
            Start speaking
          </Button>
        )}
        {phase === "recording" && (
          <Button size="1" variant="soft" onClick={dictation.stop}>
            Stop
          </Button>
        )}
        {phase === "error" && dictation.retry && (
          <Button size="1" variant="soft" onClick={dictation.retry}>
            Retry
          </Button>
        )}
        <Button size="1" variant="ghost" onClick={dictation.cancel}>
          {phase === "error" || phase === "ready" || phase === "offer"
            ? "Dismiss"
            : "Cancel"}
        </Button>
      </Flex>
    </Flex>
  );
}
