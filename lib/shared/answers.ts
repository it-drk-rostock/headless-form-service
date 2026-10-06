// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.
import { isObject } from "./object.ts";

/** A submission's answers, keyed as SurveyJS stores them. */
export type Answers = Record<string, unknown>;

/** SurveyJS's default `commentSuffix`: "Other" texts and comment areas. */
const COMMENT_SUFFIX = "-Comment";

/** Elements that show something but take no answer. */
const WITHOUT_ANSWER = new Set(["html", "image"]);

/**
 * The answers to questions of `schema` (a form version's SurveyJS JSON).
 * Every other key is dropped (blueprint §4.2, step 4), so nothing the version
 * does not ask for reaches the notification email.
 */
export function pickAnswers(schema: unknown, answers: Answers): Answers {
  const keys = answerKeys(schema);
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => keys.has(key)),
  );
}

/** Every key a submission of `schema` may carry. */
function answerKeys(schema: unknown): Set<string> {
  const keys = new Set<string>();
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
      const key = stringOr(element.valueName) ?? stringOr(element.name);
      if (key === undefined) continue;
      keys.add(key);
      keys.add(key + COMMENT_SUFFIX);
    }
  };

  if (isObject(schema)) {
    visit(schema.elements);
    if (Array.isArray(schema.pages)) {
      for (const page of schema.pages) {
        if (isObject(page)) visit(page.elements);
      }
    }
  }
  return keys;
}

function stringOr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
