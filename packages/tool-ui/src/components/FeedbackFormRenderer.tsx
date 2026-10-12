/**
 * FeedbackFormRenderer Component
 *
 * Renders schema-based feedback forms using FormRenderer.
 * Handles submit/cancel/error callbacks and required field validation.
 * Supports severity and hide submit/cancel options.
 *
 * Custom field types:
 * - toolPreview: Rich previews (Monaco diffs, git previews, etc.) via ToolPreviewField
 * - approvalHeader: Tool approval header (first-time grant or per-call) via ApprovalHeaderField
 */

import { useState, useCallback, useMemo } from "react";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { InfoCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { FormRenderer, type CustomFieldRendererProps } from "@workspace/react";
import { type FieldDefinition, type FieldValue } from "@vibestudio/types";
import {
  hasActiveFreeTextChoice,
  initialFeedbackValues,
  normalizeFreeTextValues,
  validateFeedbackValues,
  withDefaultFreeText,
} from "../feedback-form-values";
import type { FeedbackCallbacks } from "../types";
import { ToolPreviewField } from "./ToolPreviewField";
import { ApprovalHeaderField } from "./ApprovalHeaderField";

export interface FeedbackFormRendererProps extends Omit<FeedbackCallbacks, "onError"> {
  title: string;
  fields: FieldDefinition[];
  initialValues?: Record<string, FieldValue>;
  submitLabel?: string;
  cancelLabel?: string;
  severity?: "info" | "warning" | "danger";
  hideSubmit?: boolean;
  hideCancel?: boolean;
  showTitle?: boolean;
}

/**
 * Get the icon for a severity level
 */
function getSeverityIcon(severity: "info" | "warning" | "danger" | undefined) {
  switch (severity) {
    case "danger":
    case "warning":
      return <ExclamationTriangleIcon />;
    default:
      return <InfoCircledIcon />;
  }
}

/**
 * Get the color for a severity level
 */
function getSeverityColor(
  severity: "info" | "warning" | "danger" | undefined
): "blue" | "amber" | "red" {
  switch (severity) {
    case "danger":
      return "red";
    case "warning":
      return "amber";
    default:
      return "blue";
  }
}

export function FeedbackFormRenderer({
  title,
  fields,
  initialValues = {},
  submitLabel = "Save",
  cancelLabel = "Cancel",
  severity,
  hideSubmit = false,
  hideCancel = false,
  showTitle = true,
  onSubmit,
  onCancel,
}: FeedbackFormRendererProps) {
  const effectiveFields = useMemo(() => withDefaultFreeText(fields), [fields]);

  // Initialize state with defaults merged with initial values
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    initialFeedbackValues(effectiveFields, initialValues)
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = useCallback((key: string, value: FieldValue) => {
    setValidationError(null);
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (submittedValues?: Record<string, FieldValue>) => {
      const currentValues = submittedValues ?? values;
      const failure = validateFeedbackValues(effectiveFields, currentValues);
      if (failure) {
        setValidationError(failure);
        return;
      }
      setValidationError(null);
      onSubmit(normalizeFreeTextValues(effectiveFields, currentValues));
    },
    [effectiveFields, values, onSubmit]
  );

  // Check if we should show any buttons
  const showSubmit = !hideSubmit || hasActiveFreeTextChoice(effectiveFields, values);
  const showButtons = showSubmit || !hideCancel;

  // Don't show title if we have an approvalHeader field (header contains its own title)
  const hasApprovalHeader = effectiveFields.some((f) => f.type === "approvalHeader");
  const shouldShowTitle = showTitle && !hasApprovalHeader && title;

  // Custom field renderers for toolPreview and approvalHeader fields
  const customFieldRenderers = useMemo(
    () => ({
      toolPreview: ({ field }: CustomFieldRendererProps) => (
        <ToolPreviewField toolName={field.toolName ?? "unknown"} args={field.toolArgs} />
      ),
      approvalHeader: ({ field }: CustomFieldRendererProps) => (
        <ApprovalHeaderField
          agentName={field.agentName ?? "unknown"}
          toolName={field.toolName ?? "unknown"}
          displayName={field.displayName}
          isFirstTimeGrant={field.isFirstTimeGrant ?? false}
          floorLevel={field.floorLevel ?? 1}
        />
      ),
    }),
    []
  );

  return (
    <Box>
      {/* Title with optional severity icon (hidden when approvalHeader is used) */}
      {shouldShowTitle && (
        <Flex align="center" gap="2" mb="4">
          {severity && getSeverityIcon(severity)}
          <Heading size="4">{title}</Heading>
        </Flex>
      )}

      <Flex direction="column" gap="4">
        <FormRenderer
          schema={effectiveFields}
          values={values}
          onChange={handleChange}
          onSubmit={handleSubmit}
          size="2"
          showGroups={true}
          showDescriptions={true}
          showRequiredIndicators={true}
          customFieldRenderers={customFieldRenderers}
          theme="dark"
        />

        {validationError ? (
          <Text color="red" size="2" role="alert">
            {validationError}
          </Text>
        ) : null}

        {showButtons && (
          <Flex gap="3" mt="2" justify="end">
            {!hideCancel && (
              <Button variant="soft" color="gray" onClick={onCancel}>
                {cancelLabel}
              </Button>
            )}
            {showSubmit && (
              <Button
                color={severity ? getSeverityColor(severity) : undefined}
                onClick={() => handleSubmit()}
              >
                {submitLabel}
              </Button>
            )}
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
