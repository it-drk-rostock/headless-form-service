// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.
//
// The shared renderer of notification emails (blueprint §5): the dispatcher
// sends what it renders, and the email editor's preview (ticket 17) shows the
// same, so the two cannot drift apart. The template's own HTML is trusted;
// every value inserted into it is escaped.
import {
  type Answers,
  COMMENT_SUFFIX,
  nonEmpty,
  questionsOf,
} from "./answers.ts";
import { isObject } from "./object.ts";

/** A form version's `email_template` (blueprint §5.2). */
export type EmailTemplate = {
  mode: "standard";
  subject: string;
  /** HTML. */
  body: string;
};

/** What a template's placeholders are filled from. */
export type NotificationContext = {
  formName: string;
  submittedAt: Date;
  /** The submitted version's SurveyJS JSON: question order and titles. */
  schema: unknown;
  answers: Answers;
};

export type RenderedEmail = {
  /** Plain text, on one line. */
  subject: string;
  html: string;
};

/** The template, or null when `value` is not one. */
export function parseEmailTemplate(value: unknown): EmailTemplate | null {
  if (
    !isObject(value) ||
    value.mode !== "standard" ||
    typeof value.subject !== "string" ||
    typeof value.body !== "string"
  ) {
    return null;
  }
  return { mode: value.mode, subject: value.subject, body: value.body };
}

/**
 * Fills `{{form.name}}`, `{{submitted_at}}` and `{{answers_table}}`. Other
 * placeholders stay as they are. The subject is plain text, so its values are
 * not escaped and it has no answers table.
 */
export function renderNotificationEmail(
  template: EmailTemplate,
  context: NotificationContext,
): RenderedEmail {
  const formName = context.formName;
  const submittedAt = formatSubmittedAt(context.submittedAt);

  const subject = fillPlaceholders(template.subject, {
    "form.name": formName,
    submitted_at: submittedAt,
    answers_table: "",
  })
    .replace(/\s+/g, " ")
    .trim();
  const body = fillPlaceholders(template.body, {
    "form.name": escapeHtml(formName),
    submitted_at: escapeHtml(submittedAt),
    answers_table: answersTable(context.schema, context.answers),
  });
  return { subject, html: standardLayout(body) };
}

/** Replaces each known `{{ name }}` in one pass, so values are never re-read. */
function fillPlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? values[name] : placeholder,
  );
}

/**
 * The page around the body. Ticket 17 replaces it with the DRK
 * Rostock-branded Standard Layout.
 */
function standardLayout(body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${body}</body></html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SUBMITTED_AT_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/** `06.10.2026, 14:30`, in German time whatever the server's zone. */
export function formatSubmittedAt(date: Date): string {
  return SUBMITTED_AT_FORMAT.format(date);
}

/** The value SurveyJS stores for the "other" choice. */
const OTHER = "other";

const NUMBER_FORMAT = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 20,
});

const CELL =
  "padding:6px 12px 6px 0;border-bottom:1px solid #e0e0e0;vertical-align:top;text-align:left";

/**
 * Every non-empty answer as a question/answer table, in the order of the
 * version's questions. Titles and answers are escaped.
 */
export function answersTable(schema: unknown, answers: Answers): string {
  const rows: string[] = [];
  for (const question of tableQuestions(schema)) {
    const value = answerText(question, answers);
    if (value === "") continue;
    rows.push(
      `<tr><th style="${CELL};font-weight:bold">${escapeHtml(question.title)}</th><td style="${CELL}">${escapeHtml(value).replaceAll("\n", "<br>")}</td></tr>`,
    );
  }
  if (rows.length === 0) return "<p>Keine Angaben.</p>";
  return `<table role="presentation" style="border-collapse:collapse;width:100%">${rows.join("")}</table>`;
}

type Question = {
  key: string;
  title: string;
  /** Choice value → text, as SurveyJS shows it. */
  choices: Map<unknown, string>;
  otherText: string;
};

/** The questions of `schema` as the answers table shows them. */
function tableQuestions(schema: unknown): Question[] {
  return questionsOf(schema).map(({ key, element }) => ({
    key,
    title: localized(element.title) ?? nonEmpty(element.name) ?? key,
    choices: choicesOf(element.choices),
    otherText: localized(element.otherText) ?? "Sonstiges",
  }));
}

function choicesOf(choices: unknown): Map<unknown, string> {
  const texts = new Map<unknown, string>();
  if (!Array.isArray(choices)) return texts;
  for (const choice of choices) {
    if (isObject(choice)) {
      const text = localized(choice.text);
      if (text !== undefined) texts.set(choice.value, text);
    }
  }
  return texts;
}

/** The answer to `question` as text; empty when it was not answered. */
function answerText(question: Question, answers: Answers): string {
  const comment = textOf(answers[question.key + COMMENT_SUFFIX]).trim();
  let otherShown = false;
  const show = (value: unknown): string => {
    if (value === OTHER && !question.choices.has(OTHER)) {
      otherShown = true;
      return comment === ""
        ? question.otherText
        : `${question.otherText}: ${comment}`;
    }
    return question.choices.get(value) ?? textOf(value);
  };

  const value = answers[question.key];
  const text = (
    Array.isArray(value) ? value.map(show).join(", ") : show(value)
  ).trim();
  // A comment area next to the question, rather than an "other" text.
  if (comment !== "" && !otherShown) {
    return text === "" ? comment : `${text}\n${comment}`;
  }
  return text;
}

/** Any answer value as text: yes/no, German numbers, nested as key: value. */
function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return NUMBER_FORMAT.format(value);
  if (Array.isArray(value)) {
    return value
      .map(textOf)
      .filter((text) => text !== "")
      .join(", ");
  }
  if (isObject(value)) {
    return Object.entries(value)
      .map(([key, inner]) => [key, textOf(inner)])
      .filter(([, text]) => text !== "")
      .map(([key, text]) => `${key}: ${text}`)
      .join("; ");
  }
  return String(value);
}

/** A SurveyJS string, or its German (else default) text when localized. */
function localized(value: unknown): string | undefined {
  if (isObject(value)) return nonEmpty(value.de) ?? nonEmpty(value.default);
  return nonEmpty(value);
}
