import { answerProblems } from "./answer-validation.ts";
import { type Answers, questionsOf } from "./answers.ts";
import { isEmailAddress } from "./email.ts";
import { type PassMetadata, passMetadataProblem } from "./form-pass.ts";
import { isObject } from "./object.ts";

/** Personal values are encrypted separately from non-personal pass metadata. */
export type PassContext = {
  prefill: PassMetadata;
  locked_fields: string[];
  recipient: string | null;
};

export function parsePassContext(value: unknown): PassContext | null {
  if (!isObject(value)) return null;
  const prefill = value.prefill === undefined ? {} : value.prefill;
  if (passMetadataProblem(prefill) !== null || !isObject(prefill)) return null;
  const fields =
    value.locked_fields === undefined
      ? Object.keys(prefill)
      : value.locked_fields;
  if (
    !Array.isArray(fields) ||
    fields.some(
      (key) => typeof key !== "string" || !Object.hasOwn(prefill, key),
    )
  )
    return null;
  const recipient =
    typeof value.recipient === "string"
      ? value.recipient.trim().toLowerCase()
      : value.recipient;
  if (
    recipient !== undefined &&
    recipient !== null &&
    (typeof recipient !== "string" || !isEmailAddress(recipient))
  )
    return null;
  return {
    prefill: prefill as PassMetadata,
    locked_fields: [...new Set(fields)],
    recipient: recipient ?? null,
  };
}

/** Unknown fields and values of the wrong question type fail at generation. */
export function prefillFitsSchema(
  schema: unknown,
  context: PassContext,
): boolean {
  const keys = new Set(questionsOf(schema).map(({ key }) => key));
  return (
    Object.keys(context.prefill).every((key) => keys.has(key)) &&
    answerProblems(schema, context.prefill).every(
      ({ problem }) => problem !== "type",
    )
  );
}

/** Missing locked answers are restored; changed ones are refused. */
export function enforcePassFields(
  answers: Answers,
  context: PassContext,
): Answers | null {
  const result = { ...answers };
  for (const key of context.locked_fields) {
    const expected = context.prefill[key];
    if (Object.hasOwn(answers, key) && answers[key] !== expected) return null;
    Object.defineProperty(result, key, {
      value: expected,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
