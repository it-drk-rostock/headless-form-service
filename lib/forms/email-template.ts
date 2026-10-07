import type { MessageKey } from "../i18n/index.ts";
import { type Answers, questionsOf } from "../shared/answers.ts";
import { parseEmailTemplate } from "../shared/notification.ts";
import { isObject } from "../shared/object.ts";

/**
 * Limits of a draft's email template. Same values as the
 * `forms_draft_email_template_shape_check` constraint.
 */
export const EMAIL_SUBJECT_MAX_LENGTH = 250;
export const EMAIL_BODY_MAX_LENGTH = 100_000;

/** Why `value` cannot be saved as the draft's email template, or null if it can. */
export function emailTemplateProblem(value: unknown): MessageKey | null {
  const template = parseEmailTemplate(value);
  if (template === null) return "forms.errorEmailInvalid";
  if (template.subject.trim() === "") return "forms.errorEmailSubjectMissing";
  if (template.subject.length > EMAIL_SUBJECT_MAX_LENGTH) {
    return "forms.errorEmailSubjectTooLong";
  }
  if (template.body.length > EMAIL_BODY_MAX_LENGTH) {
    return "forms.errorEmailBodyTooLong";
  }
  return null;
}

/**
 * Made-up answers to every question of `schema`, for the email editor's
 * preview: the first choice of a choice question, a value of the right kind
 * otherwise.
 */
export function sampleAnswers(schema: unknown): Answers {
  return Object.fromEntries(
    questionsOf(schema).map(({ key, element }) => [key, sampleOf(element)]),
  );
}

function sampleOf(question: Record<string, unknown>): unknown {
  switch (question.type) {
    case "boolean":
      return true;
    case "rating":
      return 4;
    case "comment":
      return "Beispieltext";
    case "radiogroup":
    case "dropdown":
    case "imagepicker":
      return firstChoice(question.choices) ?? "Beispielantwort";
    case "checkbox":
    case "tagbox":
    case "ranking": {
      const choice = firstChoice(question.choices);
      return choice === undefined ? ["Beispielantwort"] : [choice];
    }
  }
  switch (question.inputType) {
    case "email":
      return "erika.mustermann@example.org";
    case "number":
    case "range":
      return 42;
    case "date":
      return "2026-10-07";
    case "tel":
      return "0381 123456";
  }
  return "Beispielantwort";
}

/** A choice's value; SurveyJS allows plain values or `{ value, text }`. */
function firstChoice(choices: unknown): unknown {
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const [choice] = choices;
  return isObject(choice) ? choice.value : choice;
}
