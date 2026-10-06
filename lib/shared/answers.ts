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
  const visit = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isObject(element)) continue;
      // A panel only groups questions; its own name holds no answer.
      if (element.type === "panel") {
        visit(element.elements);
        continue;
      }
      if (typeof element.type === "string" && WITHOUT_ANSWER.has(element.type))
        continue;
      // Questions store their answer under `valueName` when one is set. A
      // dynamic panel's inner questions live inside its own value.
      const key = nonEmpty(element.valueName) ?? nonEmpty(element.name);
      if (key !== undefined && !questions.has(key)) {
        questions.set(key, { key, element });
      }
    }
  };

  if (isObject(schema)) {
    if (Array.isArray(schema.pages)) {
      for (const page of schema.pages) {
        if (isObject(page)) visit(page.elements);
      }
    }
    visit(schema.elements);
  }
  return [...questions.values()];
}

export function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
