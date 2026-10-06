// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.
import { isObject } from "./object.ts";

/** A submission's answers, keyed as SurveyJS stores them. */
export type Answers = Record<string, unknown>;

/** SurveyJS's default `commentSuffix`: "Other" texts and comment areas. */
export const COMMENT_SUFFIX = "-Comment";

/** Elements that show something but take no answer. */
const WITHOUT_ANSWER = new Set(["html", "image"]);

/** A question of a form version, and the key its answer is stored under. */
export type AnsweredQuestion = {
  key: string;
  /** The question's SurveyJS JSON. */
  element: Record<string, unknown>;
  /**
   * Whether the question, or a panel or page around it, can be hidden or
   * disabled, which depends on other answers only SurveyJS can evaluate.
   */
  mayBeSkipped: boolean;
};

/**
 * The answers to questions of `schema` (a form version's SurveyJS JSON).
 * Every other key is dropped (blueprint §4.2, step 4), so nothing the version
 * does not ask for reaches the notification email.
 */
export function pickAnswers(schema: unknown, answers: Answers): Answers {
  const keys = new Set<string>();
  for (const { key } of questionsOf(schema)) {
    keys.add(key);
    keys.add(key + COMMENT_SUFFIX);
  }
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => keys.has(key)),
  );
}

/**
 * The questions of `schema` that take an answer, in display order (pages,
 * then panels inside them), once per answer key: questions sharing a
 * `valueName` share one answer.
 */
export function questionsOf(schema: unknown): AnsweredQuestion[] {
  const questions = new Map<string, AnsweredQuestion>();
  const visit = (elements: unknown, insideSkippable: boolean): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isObject(element)) continue;
      const mayBeSkipped = insideSkippable || isSkippable(element);
      // A panel only groups questions; its own name holds no answer.
      if (element.type === "panel") {
        visit(element.elements, mayBeSkipped);
        continue;
      }
      if (typeof element.type === "string" && WITHOUT_ANSWER.has(element.type))
        continue;
      // Questions store their answer under `valueName` when one is set. A
      // dynamic panel's inner questions live inside its own value.
      const key = nonEmpty(element.valueName) ?? nonEmpty(element.name);
      if (key !== undefined && !questions.has(key)) {
        questions.set(key, { key, element, mayBeSkipped });
      }
    }
  };

  if (isObject(schema)) {
    if (Array.isArray(schema.pages)) {
      for (const page of schema.pages) {
        if (isObject(page)) visit(page.elements, isSkippable(page));
      }
    }
    visit(schema.elements, false);
  }
  return [...questions.values()];
}

/** Whether a page, panel or question may not be shown or editable. */
function isSkippable(element: Record<string, unknown>): boolean {
  return (
    element.visible === false ||
    element.readOnly === true ||
    nonEmpty(element.visibleIf) !== undefined ||
    nonEmpty(element.enableIf) !== undefined ||
    // Hidden once its choices filter down to none.
    element.hideIfChoicesEmpty === true
  );
}

export function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
