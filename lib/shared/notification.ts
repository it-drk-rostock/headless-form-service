// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.
//
// The shared renderer of notification emails (blueprint §5): the dispatcher
// sends what it renders, and the email editor's preview shows the same, so
// the two cannot drift apart. The template's own HTML is trusted, a Custom
// HTML Template's as much as the Standard Layout's; every value inserted into
// it is escaped.
import {
  type Answers,
  COMMENT_SUFFIX,
  nonEmpty,
  questionsOf,
} from "./answers.ts";
import { isEmailAddress, normalizeEmail } from "./email.ts";
import { isObject } from "./object.ts";

/** A form version's `email_template` (blueprint §5.2). */
export type EmailTemplate = {
  mode: EmailTemplateMode;
  subject: string;
  /**
   * HTML: the Standard Layout's body, or the whole email of a Custom HTML
   * Template.
   */
  body: string;
};

export type EmailTemplateMode = "standard" | "custom";

const MODES: readonly string[] = [
  "standard",
  "custom",
] satisfies EmailTemplateMode[];

export function isEmailTemplateMode(
  value: unknown,
): value is EmailTemplateMode {
  return typeof value === "string" && MODES.includes(value);
}

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
    !isEmailTemplateMode(value.mode) ||
    typeof value.subject !== "string" ||
    typeof value.body !== "string"
  ) {
    return null;
  }
  return {
    mode: value.mode,
    subject: value.subject,
    body: value.body,
  };
}

/** The placeholders every template knows, besides the answers' (blueprint §5.1). */
export const FORM_NAME = "form.name";
export const SUBMITTED_AT = "submitted_at";
export const ANSWERS_TABLE = "answers_table";
const ANSWERS = "answers.";

/** A placeholder as written in a template. */
export function placeholderText(name: string): string {
  return `{{${name}}}`;
}

/** Whether a placeholder can be filled in the subject, which is plain text. */
export function fitsSubject(name: string): boolean {
  return name !== ANSWERS_TABLE;
}

/**
 * `{{ name }}`: anything but braces, spaces around it ignored, so question
 * names with spaces or umlauts work too.
 */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** A paragraph holding only the answers table, as the editor stores it. */
const ANSWERS_TABLE_PARAGRAPH = /<p>\s*\{\{\s*answers_table\s*\}\}\s*<\/p>/g;

/**
 * Fills `{{answers.<question>}}`, `{{form.name}}`, `{{submitted_at}}` and
 * `{{answers_table}}`. Other placeholders (e.g. `{{pass.*}}` until ticket 28,
 * or a question a later version renamed) stay as they are. The subject is
 * plain text, so its values are not escaped and it has no answers table.
 * A Standard Layout body is wrapped in the layout; a Custom HTML Template is
 * the whole email as its author wrote it.
 */
export function renderNotificationEmail(
  template: EmailTemplate,
  context: NotificationContext,
): RenderedEmail {
  const formName = context.formName;
  const submittedAt = formatSubmittedAt(context.submittedAt);
  const questions = new Map(
    tableQuestions(context.schema).map((question) => [question.key, question]),
  );
  /** The value of `name` as text, or undefined when it is unknown. */
  const value = (name: string): string | undefined => {
    if (name === FORM_NAME) return formName;
    if (name === SUBMITTED_AT) return submittedAt;
    if (!name.startsWith(ANSWERS)) return undefined;
    const question = questions.get(name.slice(ANSWERS.length));
    return question && answerText(question, context.answers);
  };

  const subject = fillPlaceholders(template.subject, (name) =>
    fitsSubject(name) ? value(name) : "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const html = fillPlaceholders(
    template.mode === "standard"
      ? standardLayoutHtml(template.body)
      : template.body,
    (written) => {
      const name = bodyName(written);
      if (name === ANSWERS_TABLE) {
        return answersTable(context.schema, context.answers);
      }
      const text = value(name);
      return text === undefined
        ? undefined
        : escapeHtml(text).replaceAll("\n", "<br>");
    },
  );
  return { subject, html };
}

/**
 * Replaces each placeholder `value` knows in one pass, so inserted values are
 * never read again; the others stay as written.
 */
function fillPlaceholders(
  text: string,
  value: (name: string) => string | undefined,
): string {
  return text.replace(
    PLACEHOLDER,
    (placeholder, name: string) => value(name) ?? placeholder,
  );
}

/**
 * A placeholder's name in the body as the editor shows it: the HTML escapes
 * `&`, `<`, `>` and repeated spaces of question names.
 */
function bodyName(written: string): string {
  return written
    .replaceAll("&nbsp;", " ")
    .replaceAll(" ", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** A question's placeholder, for the email editor to insert. */
export type AnswerPlaceholder = { name: string; title: string };

/**
 * `{{answers.<question>}}` for every question of `schema` that takes an
 * answer, in question order. Questions whose name a placeholder cannot hold
 * (braces, spaces around it) are left out.
 */
export function answerPlaceholders(schema: unknown): AnswerPlaceholder[] {
  return tableQuestions(schema)
    .filter(({ key }) => !/[{}]/.test(key) && key.trim() === key)
    .map(({ key, title }) => ({ name: ANSWERS + key, title }));
}

/** A question that asks for an email address, by its answer key. */
export type EmailQuestion = { name: string; title: string };

/**
 * The questions of `schema` that ask for an email address, in question
 * order: the ones that can be the form's Reply-To Field (GLOSSARY). `name`
 * is the key the answer is stored under.
 */
export function emailQuestions(schema: unknown): EmailQuestion[] {
  return questionsOf(schema)
    .filter(
      ({ element }) => element.type === "text" && element.inputType === "email",
    )
    .map(({ key, element }) => ({
      name: key,
      title: localized(element.title) ?? nonEmpty(element.name) ?? key,
    }));
}

/**
 * The Reply-To of a notification email (blueprint §4.4): the answer to the
 * form's Reply-To question, if it is one valid email address. Null otherwise,
 * and then replies go to the sender.
 */
export function replyToAddress(
  answers: Answers,
  question: string | null,
): string | null {
  if (question === null) return null;
  const answer = answers[question];
  if (typeof answer !== "string") return null;
  const address = answer.trim();
  return isEmailAddress(normalizeEmail(address)) ? address : null;
}

/** The sender's name for forms that have no display name of their own. */
export const DEFAULT_SENDER_NAME = "DRK Rostock Formular-Service";

/**
 * A sender display name as stored: trimmed and on one line, without control
 * characters, since it goes into the From header (the database checks the
 * same). Empty means the service's own name.
 */
export function normalizeSenderName(name: string): string {
  return name.replace(/[\s\p{Cc}]+/gu, " ").trim();
}

/**
 * The name shown with the global sender address (GLOSSARY, Sender): the
 * form's display name, or `DEFAULT_SENDER_NAME` without one.
 */
export function senderName(displayName: string): string {
  return normalizeSenderName(displayName) || DEFAULT_SENDER_NAME;
}

/**
 * The placeholders the renderer fills in a body: the system ones and the
 * answer of every question of `schema`. A subject knows those that
 * `fitsSubject`.
 */
export function knownPlaceholders(schema: unknown): Set<string> {
  return new Set([
    FORM_NAME,
    SUBMITTED_AT,
    ANSWERS_TABLE,
    ...questionsOf(schema).map(({ key }) => ANSWERS + key),
  ]);
}

/**
 * The placeholders of `template` the renderer would leave as written, each
 * once and in order, as the editor shows them: they stay visible in the
 * email, so the editor flags them.
 */
export function unknownPlaceholders(
  template: EmailTemplate,
  schema: unknown,
): { subject: string[]; body: string[] } {
  const known = knownPlaceholders(schema);
  const unknownIn = (names: string[], isKnown: (name: string) => boolean) => [
    ...new Set(names.filter((name) => !isKnown(name))),
  ];
  const namesIn = (text: string) =>
    findPlaceholders(text).map(({ name }) => name);
  return {
    subject: unknownIn(
      namesIn(template.subject),
      (name) => fitsSubject(name) && known.has(name),
    ),
    body: unknownIn(namesIn(template.body).map(bodyName), (name) =>
      known.has(name),
    ),
  };
}

/** A placeholder in a text: where it starts, how long it is, and its name. */
export type FoundPlaceholder = { index: number; length: number; name: string };

/** Every placeholder in `text`, as the renderer reads them. */
export function findPlaceholders(text: string): FoundPlaceholder[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => ({
    index: match.index,
    length: match[0].length,
    name: match[1],
  }));
}

const FONT = "Arial,Helvetica,sans-serif";

/**
 * The DRK Rostock-branded Standard Layout around a body, its placeholders
 * left to fill (blueprint §5.2): a red header, the body on a white card, and
 * a footer. Tables and inline styles, so mail clients render it alike; at
 * most 640px wide, narrower on phones. No emblem: only official logo files
 * may be used (ui-design §7). Laid out over lines, as a Custom HTML Template
 * starts from it.
 */
export function standardLayoutHtml(body: string): string {
  // A table can't sit inside a paragraph, so it takes the paragraph's place.
  const content = body.replace(
    ANSWERS_TABLE_PARAGRAPH,
    placeholderText(ANSWERS_TABLE),
  );
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
.inhalt h2{font-size:20px;line-height:1.3;margin:0 0 12px}
.inhalt h3{font-size:17px;line-height:1.3;margin:20px 0 8px}
.inhalt p{margin:0 0 12px}
.inhalt a{color:#E60005}
.inhalt hr{border:0;border-top:1px solid #dee2e6;margin:20px 0}
.inhalt ul,.inhalt ol{margin:0 0 12px;padding-left:24px}
</style>
</head>
<body style="margin:0;padding:0;background:#f1f3f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #dee2e6;border-collapse:separate">
<tr><td style="background:#E60005;padding:16px 24px;font-family:${FONT};font-size:18px;font-weight:bold;color:#ffffff">DRK Rostock</td></tr>
<tr><td class="inhalt" style="padding:24px;font-family:${FONT};font-size:15px;line-height:1.5;color:#1a1a1a">
${content}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #dee2e6;font-family:${FONT};font-size:12px;line-height:1.5;color:#868e96">Diese E-Mail wurde automatisch vom Formular-Service des DRK Rostock versendet.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
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
