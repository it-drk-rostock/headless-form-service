// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.
import { type Answers, COMMENT_SUFFIX, questionsOf } from "./answers.ts";
import { isObject } from "./object.ts";

/**
 * Something wrong with one answer: a required question left empty, or a value
 * of a shape its question never stores. Names only the key, never the value.
 */
export type AnswerProblem = { key: string; problem: "required" | "type" };

/**
 * What is wrong with `answers` for `schema` (a form version's SurveyJS JSON),
 * blueprint §4.2 step 4. The embed validates with SurveyJS before sending;
 * this is the server's own, coarser check against hand-made requests, so it
 * never refuses what the embed sends:
 *
 * - Required questions must be answered, unless they or a panel or page
 *   around them can be hidden or disabled (`questionsOf`'s `mayBeSkipped`), or
 *   a trigger can end the survey or skip ahead.
 * - Each answer must have the basic shape its question type stores. Types it
 *   does not know (custom widgets) take anything.
 *
 * Keys that are not questions are not checked; `pickAnswers` drops them.
 */
export function answerProblems(
  schema: unknown,
  answers: Answers,
): AnswerProblem[] {
  const problems: AnswerProblem[] = [];
  const enforceRequired = !canSkipPages(schema);
  for (const { key, element, mayBeSkipped } of questionsOf(schema)) {
    const value = answers[key];
    if (isEmpty(value)) {
      if (element.isRequired === true && enforceRequired && !mayBeSkipped) {
        problems.push({ key, problem: "required" });
      }
    } else if (!fitsType(element, value)) {
      problems.push({ key, problem: "type" });
    }
    const comment = answers[key + COMMENT_SUFFIX];
    if (!isEmpty(comment) && typeof comment !== "string") {
      problems.push({ key: key + COMMENT_SUFFIX, problem: "type" });
    }
  }
  return problems;
}

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string";
const isNumber: Check = (value) =>
  typeof value === "number" && Number.isFinite(value);
const isPrimitive: Check = (value) =>
  isString(value) || isNumber(value) || typeof value === "boolean";
const arrayOf =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const recordOf =
  (check: Check): Check =>
  (value) =>
    isObject(value) && Object.values(value).every(check);
const either =
  (...checks: Check[]): Check =>
  (value) =>
    checks.some((check) => check(value));
const isRecord = recordOf(() => true);

/**
 * The shape SurveyJS stores for each built-in question type. Expressions are
 * missing on purpose: they compute any value, lists included.
 */
const SHAPES: Record<string, (element: Record<string, unknown>) => Check> = {
  // `inputType: "number"` and `"range"` store numbers.
  text: () => either(isString, isNumber),
  comment: () => isString,
  signaturepad: () => isString,
  radiogroup: () => isPrimitive,
  dropdown: () => isPrimitive,
  rating: () => isPrimitive,
  // With `valuePropertyName`, each selected choice is stored as an object.
  checkbox: () => arrayOf(either(isPrimitive, isRecord)),
  tagbox: () => arrayOf(either(isPrimitive, isRecord)),
  ranking: () => arrayOf(isPrimitive),
  imagepicker: (element) =>
    element.multiSelect === true ? arrayOf(isPrimitive) : isPrimitive,
  // `true`/`false`, unless replaced by `valueTrue`/`valueFalse`.
  boolean: (element) => (value) =>
    typeof value === "boolean" ||
    value === element.valueTrue ||
    value === element.valueFalse,
  // Row → column; a row may hold several columns where cells are checkboxes.
  matrix: () => recordOf(either(isPrimitive, arrayOf(isPrimitive))),
  matrixdropdown: () => recordOf(isRecord),
  matrixdynamic: () => arrayOf(isRecord),
  paneldynamic: () => arrayOf(isRecord),
  multipletext: () => recordOf(either(isString, isNumber)),
  file: () => arrayOf(isRecord),
  slider: () => either(isNumber, arrayOf(isNumber)),
};

function fitsType(element: Record<string, unknown>, value: unknown): boolean {
  const shape =
    typeof element.type === "string" && Object.hasOwn(SHAPES, element.type)
      ? SHAPES[element.type]
      : undefined;
  return shape === undefined || shape(element)(value);
}

/**
 * Whether a trigger can complete the survey early or jump past questions, so
 * any required question may never have been shown.
 */
function canSkipPages(schema: unknown): boolean {
  return (
    isObject(schema) &&
    Array.isArray(schema.triggers) &&
    schema.triggers.some(
      (trigger) =>
        isObject(trigger) &&
        (trigger.type === "complete" || trigger.type === "skip"),
    )
  );
}

/** Unanswered, as SurveyJS sees it. `false` and `0` are answers. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return isObject(value) && Object.keys(value).length === 0;
}
