/**
 * Value semantics of `feedback_form`, independent of how a form is drawn:
 * which choice fields get an "Other" free-text choice, how a free-text choice
 * folds into the submitted value, and required-field validation. The panel's
 * FeedbackFormRenderer and the terminal chat's form both use these, so an
 * agent gets the same answer shape from either surface.
 */
import { FREE_TEXT_CHOICE_VALUE, type FieldDefinition, type FieldValue } from "@vibestudio/types";

export function isChoiceField(field: FieldDefinition): boolean {
  return (
    field.type === "select" ||
    field.type === "segmented" ||
    field.type === "multiSelect" ||
    field.type === "buttonGroup"
  );
}

export function getsDefaultFreeText(field: FieldDefinition): boolean {
  return field.type === "select" || field.type === "segmented" || field.type === "multiSelect";
}

export function getFreeTextKey(field: FieldDefinition): string {
  return field.freeTextKey ?? `${field.key}FreeText`;
}

export function withDefaultFreeText(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field) => {
    if (!getsDefaultFreeText(field) || field.allowFreeText !== undefined) {
      return field;
    }
    return { ...field, allowFreeText: true };
  });
}

export function hasActiveFreeTextChoice(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>
): boolean {
  return fields.some((field) => {
    if (!isChoiceField(field) || field.allowFreeText !== true) return false;
    const value = values[field.key];
    return Array.isArray(value)
      ? value.includes(FREE_TEXT_CHOICE_VALUE)
      : value === FREE_TEXT_CHOICE_VALUE;
  });
}

export function normalizeFreeTextValues(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>
): Record<string, FieldValue> {
  const normalized = { ...values };
  for (const field of fields) {
    if (!isChoiceField(field) || field.allowFreeText !== true) continue;

    const freeTextKey = getFreeTextKey(field);
    const freeText = String(values[freeTextKey] ?? "").trim();
    const value = values[field.key];

    if (Array.isArray(value)) {
      if (value.includes(FREE_TEXT_CHOICE_VALUE)) {
        normalized[field.key] = value.flatMap((item) =>
          item === FREE_TEXT_CHOICE_VALUE ? (freeText ? [freeText] : []) : [item]
        );
      }
    } else if (value === FREE_TEXT_CHOICE_VALUE && freeText) {
      normalized[field.key] = freeText;
    }

    delete normalized[freeTextKey];
  }
  return normalized;
}

/** Initial values: each field's default, overlaid with the agent's `values`. */
export function initialFeedbackValues(
  fields: FieldDefinition[],
  initialValues: Record<string, FieldValue> = {}
): Record<string, FieldValue> {
  const defaults: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.default !== undefined) defaults[field.key] = field.default;
  }
  return { ...defaults, ...initialValues };
}

/** The first validation failure, as the sentence the form shows; null when valid. */
export function validateFeedbackValues(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>
): string | null {
  for (const field of fields) {
    if (field.required) {
      const value = values[field.key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        return `Required field "${field.label ?? field.key}" is missing`;
      }
    }
    if (
      isChoiceField(field) &&
      field.allowFreeText === true &&
      hasActiveFreeTextChoice([field], values) &&
      String(values[getFreeTextKey(field)] ?? "").trim() === ""
    ) {
      return `Required field "${field.label ?? field.key}" is missing`;
    }
  }
  return null;
}
