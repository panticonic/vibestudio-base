import type { AudienceModel } from "./types.js";

/** A bounded set of integer inputs, with integer-cent rounding before display. */
export function audienceCost(model: AudienceModel, units: number): number {
  if (!Number.isSafeInteger(units) || units < model.min || units > model.max) {
    throw new Error("Choose a whole quantity within the recorded bounds.");
  }
  return Math.round((model.baseCents + model.unitCents * units) / model.divisor) / 100;
}

function validateModel(model: AudienceModel) {
  const { baseCents, unitCents, divisor, initial, min, max } = model;
  if (![baseCents, unitCents, divisor, initial, min, max].every(Number.isSafeInteger) ||
    baseCents < 0 || unitCents < 0 || divisor < 1 || min < 0 || max <= min || initial < min || initial > max ||
    !Number.isSafeInteger(baseCents + unitCents * max)) throw new Error("The recorded cost model is invalid.");
}

/** The only code in the MDX is this authored, fixed arithmetic handler. */
export function renderAudienceCalculator(model: AudienceModel): string {
  validateModel(model);
  const fields = [{ name: "quantity", label: model.inputLabel, type: "number", min: model.min, max: model.max,
    default: model.initial, step: 1 }];
  const literal = (value: unknown) => JSON.stringify(value).replace(/</gu, "\\u003c");
  return `<Calculator title={${literal(model.title)}} fields={${literal(fields)}} currency="USD" compute={({ quantity }) => {
    if (!Number.isSafeInteger(quantity) || quantity < ${model.min} || quantity > ${model.max}) {
      throw new Error("Choose a whole quantity within the recorded bounds.");
    }
    return [{ label: ${literal(model.outputLabel)}, value: "$" + (Math.round((${model.baseCents} + ${model.unitCents} * quantity) / ${model.divisor}) / 100).toFixed(2) }];
  }} />`;
}
