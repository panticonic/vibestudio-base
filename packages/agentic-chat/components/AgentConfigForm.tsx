import ModelCredentialRequiredCard from "./ModelCredentialRequiredCard";
import type { ChatContextValue } from "../types";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  SegmentedControl,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { CheckIcon } from "@radix-ui/react-icons";
import type {
  AgentApprovalLevel,
  AgentRespondPolicy,
  AgentThinkingLevel,
  ModelCatalog,
} from "@workspace/agentic-core";
import type { DefaultAgentConfig } from "@workspace/model-catalog/catalog";
import { ModelPicker } from "./ModelPicker";

export interface AgentConfigDraft {
  model: string;
  thinkingLevel?: AgentThinkingLevel;
  fastMode?: boolean;
  approvalLevel?: AgentApprovalLevel;
  respondPolicy?: AgentRespondPolicy;
  respondFrom?: string[];
  handle?: string;
  systemPrompt?: string;
}

export interface AgentConfigFormProps {
  catalog: ModelCatalog | null;
  onConnectModelProvider?: ChatContextValue["onConnectModelProvider"];
  value: AgentConfigDraft;
  onChange: (next: AgentConfigDraft) => void;
  /** False in edit mode — model is read-only (switching model needs a restart). */
  modelEditable?: boolean;
  /** Current workspace default agent config — drives the "Save as defaults" state. */
  defaultAgentConfig?: DefaultAgentConfig | null;
  /** Explicitly persist the full config (model + behavior) as the workspace
   *  default. When absent, the "Save as defaults" control is hidden. */
  onSaveAsDefault?: (config: DefaultAgentConfig) => void | Promise<void>;
  /** Show the reactiveness control (only meaningful with >1 agent in channel). */
  showReactiveness?: boolean;
  /** Show the @-mention handle field (matters in multi-agent channels). */
  showHandle?: boolean;
  /** Other participants, for the "specific people" respond policy. */
  participants?: Array<{ id: string; label: string }>;
  /** Deep-link a local model's error dot to the Local Models panel log (item 6). */
  onOpenServerLog?: (server: "utility" | "main") => void;
}

const THINKING_LABELS: Record<AgentThinkingLevel, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

const APPROVAL_LABELS: Record<string, string> = {
  "0": "Manual",
  "1": "Auto-safe",
  "2": "Full-auto",
};

/** Selecting a model starts from that model's product defaults. Existing
 * agents are edited elsewhere with a locked model, so this never overwrites a
 * persisted per-agent choice. */
export function configForSelectedModel(ref: string): Pick<AgentConfigDraft, "model" | "fastMode"> {
  return { model: ref, fastMode: false };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="1" color="gray">
          {hint}
        </Text>
      )}
    </Flex>
  );
}

export function AgentConfigForm({
  catalog,
  value,
  onChange,
  modelEditable = true,
  defaultAgentConfig,
  onSaveAsDefault,
  showReactiveness = false,
  showHandle = false,
  participants = [],
  onOpenServerLog,
  onConnectModelProvider,
}: AgentConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const set = (patch: Partial<AgentConfigDraft>) => onChange({ ...value, ...patch });

  const handleSaveAsDefault = useCallback(async () => {
    if (!onSaveAsDefault || !value.model) return;
    const config: DefaultAgentConfig = {
      model: value.model,
      ...(value.thinkingLevel ? { thinkingLevel: value.thinkingLevel } : {}),
      ...(value.fastMode !== undefined ? { fastMode: value.fastMode } : {}),
      approvalLevel: value.approvalLevel ?? 2,
    };
    setSavingDefault(true);
    try {
      await onSaveAsDefault(config);
    } catch (err) {
      console.warn("[AgentConfigForm] Failed to save default agent config:", err);
    } finally {
      setSavingDefault(false);
    }
  }, [onSaveAsDefault, value.model, value.thinkingLevel, value.fastMode, value.approvalLevel]);

  const selectedModel = useMemo(
    () => catalog?.models.find((m) => m.ref === value.model) ?? null,
    [catalog, value.model],
  );
  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const showEffort = !!selectedModel?.reasoning && thinkingLevels.length > 0;
  const showFastMode = selectedModel?.modelSpec?.serviceTiers?.includes("priority") ?? false;
  const effort: AgentThinkingLevel =
    value.thinkingLevel && thinkingLevels.includes(value.thinkingLevel)
      ? value.thinkingLevel
      : thinkingLevels.includes("medium")
        ? "medium"
        : (thinkingLevels[thinkingLevels.length - 1] ?? "medium");

  const policy: AgentRespondPolicy = value.respondPolicy ?? "all";

  // Does the current draft match the saved workspace defaults (model + the
  // behavior fields we persist)? Drives the "Save as defaults" footer.
  const savedDefaultsMatch =
    !!defaultAgentConfig &&
    value.model === defaultAgentConfig.model &&
    (value.thinkingLevel ?? null) === (defaultAgentConfig.thinkingLevel ?? null) &&
    (value.fastMode ?? false) === (defaultAgentConfig.fastMode ?? false) &&
    (value.approvalLevel ?? 2) === (defaultAgentConfig.approvalLevel ?? 2);

  return (
    <Flex className="agent-config-form" direction="column" gap="3">
      {/* Provider + model */}
      {modelEditable ? (
        <ModelPicker
          catalog={catalog}
          value={value.model}
          recommendedModelRef={defaultAgentConfig?.model}
          onChange={(ref) => set(configForSelectedModel(ref))}
          onOpenServerLog={onOpenServerLog}
        />
      ) : (
        <Field label="Model">
          <Flex align="center" gap="2">
            <Badge variant="soft" color="gray" size="2">
              {selectedModel?.name ?? value.model}
            </Badge>
            <Text size="1" color="gray">
              Switching the model restarts this agent.
            </Text>
          </Flex>
        </Field>
      )}

      {selectedModel?.connectable &&
      onConnectModelProvider &&
      ["needs-setup", "error"].includes(selectedModel.availability.state) ? (
        <ModelCredentialRequiredCard
          key={selectedModel.ref}
          onConnect={onConnectModelProvider}
          props={{
            providerId: selectedModel.provider,
            modelRef: selectedModel.ref,
            modelBaseUrl: selectedModel.baseUrl,
            configuration: selectedModel.connection?.configuration,
            method: selectedModel.connection?.method,
            ...(selectedModel.availability.state === "error"
              ? { reason: selectedModel.availability.message }
              : {}),
            ...(selectedModel.availability.state === "needs-setup" &&
            selectedModel.availability.detail === "credential-expired"
              ? {
                  reason: "Your connection has expired. Sign in again to continue.",
                }
              : {}),
          }}
        />
      ) : null}

      {/* Reactiveness — only with >1 agent */}
      {showReactiveness && (
        <Field label="Reactiveness" hint="When this agent replies in a multi-agent channel.">
          <Select.Root
            value={policy}
            onValueChange={(respondPolicy) =>
              set({ respondPolicy: respondPolicy as AgentRespondPolicy })
            }
          >
            <Select.Trigger aria-label="Reactiveness" style={{ width: "100%" }} />
            <Select.Content>
              <Select.Item value="all">Everything</Select.Item>
              <Select.Item value="mentioned">@mention</Select.Item>
              <Select.Item value="mentioned-or-followup">Mention + reply</Select.Item>
              {participants.length > 0 && (
                <Select.Item value="from-participants">Specific people</Select.Item>
              )}
            </Select.Content>
          </Select.Root>
          {policy === "from-participants" && participants.length > 0 && (
            <Flex direction="column" gap="1" mt="2">
              {participants.map((p) => {
                const checked = (value.respondFrom ?? []).includes(p.id);
                return (
                  <Text as="label" size="2" key={p.id}>
                    <Flex align="center" gap="2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          const cur = new Set(value.respondFrom ?? []);
                          if (c) cur.add(p.id);
                          else cur.delete(p.id);
                          set({ respondFrom: [...cur] });
                        }}
                      />
                      {p.label}
                    </Flex>
                  </Text>
                );
              })}
            </Flex>
          )}
        </Field>
      )}

      {/* Handle — matters for @-mentions in multi-agent channels */}
      {showHandle && (
        <Field label="Handle" hint="Used to @mention this agent.">
          <TextField.Root
            value={value.handle ?? ""}
            onChange={(e) => set({ handle: e.target.value })}
            placeholder="agent"
          />
        </Field>
      )}

      <Flex gap="3" justify="between" align="end" wrap="wrap">
        <Flex className="agent-config-tuning" gap="3" align="end" wrap="wrap">
          {showEffort && (
            <Field label="Effort">
              <Select.Root
                value={effort}
                onValueChange={(thinkingLevel) =>
                  set({ thinkingLevel: thinkingLevel as AgentThinkingLevel })
                }
              >
                <Select.Trigger aria-label="Effort" />
                <Select.Content>
                  {thinkingLevels.map((level) => (
                    <Select.Item key={level} value={level}>
                      {THINKING_LABELS[level]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>
          )}
          {showFastMode && (
            <Text as="label" size="2" title="Faster responses at a higher credit rate.">
              <Flex align="center" gap="2" className="agent-config-check-row">
                <Checkbox
                  aria-label="Fast mode"
                  checked={value.fastMode ?? false}
                  onCheckedChange={(checked) => set({ fastMode: checked === true })}
                />
                <span>Fast mode</span>
              </Flex>
            </Text>
          )}
        </Flex>

        {/* Advanced */}
        <Flex className="agent-config-actions" gap="2" align="center" wrap="wrap">
          <Button
            type="button"
            variant="soft"
            color="gray"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? "▾ Advanced" : "▸ Advanced"}
          </Button>

          {/* Save-as-defaults — the ONLY path that writes the workspace default agent
          config (model + behavior). The button appears only when the draft
          differs from the saved defaults; when it matches, a quiet indicator
          shows instead. Hidden entirely when the host doesn't support it. */}
          {modelEditable && onSaveAsDefault && value.model && defaultAgentConfig && (
            <Box>
              {savedDefaultsMatch ? (
                <Flex align="center" gap="1">
                  <CheckIcon style={{ color: "var(--green-9)" }} />
                  <Text size="1" color="gray">
                    Workspace defaults
                  </Text>
                </Flex>
              ) : (
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  loading={savingDefault}
                  onClick={() => void handleSaveAsDefault()}
                >
                  Save defaults
                </Button>
              )}
            </Box>
          )}
        </Flex>
      </Flex>
      {showAdvanced && (
        <Flex direction="column" gap="3" mt="2">
          <Field
            label="Autonomy"
            hint="Manual asks before each tool call; Full-auto runs everything."
          >
            <SegmentedControl.Root
              value={String(value.approvalLevel ?? 2)}
              style={{ width: "100%" }}
              onValueChange={(v) => set({ approvalLevel: Number(v) as AgentApprovalLevel })}
            >
              <SegmentedControl.Item value="0">{APPROVAL_LABELS["0"]}</SegmentedControl.Item>
              <SegmentedControl.Item value="1">{APPROVAL_LABELS["1"]}</SegmentedControl.Item>
              <SegmentedControl.Item value="2">{APPROVAL_LABELS["2"]}</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Field>
          <Field label="System prompt (optional)" hint="Appended to the workspace system prompt.">
            <TextArea
              value={value.systemPrompt ?? ""}
              onChange={(e) => set({ systemPrompt: e.target.value })}
              placeholder="Extra instructions for this agent…"
              rows={4}
            />
          </Field>
        </Flex>
      )}
    </Flex>
  );
}
