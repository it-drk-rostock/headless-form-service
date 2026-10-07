import { describe, expect, it } from "vitest";
import { answersTable } from "../shared/notification.ts";
import {
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_SUBJECT_MAX_LENGTH,
  emailTemplateProblem,
  sampleAnswers,
} from "./email-template.ts";

const template = (subject: string, body = "<p>Hallo</p>") => ({
  mode: "standard",
  subject,
  body,
});

describe("emailTemplateProblem", () => {
  it("accepts a Standard Layout template", () => {
    expect(emailTemplateProblem(template("Neu: {{form.name}}"))).toBeNull();
  });

  it.each([
    ["no template", "text"],
    ["an unknown mode", { mode: "mjml", subject: "S", body: "" }],
  ])("refuses %s", (_, value) => {
    expect(emailTemplateProblem(value)).toBe("forms.errorEmailInvalid");
  });

  it("needs a subject", () => {
    expect(emailTemplateProblem(template("   "))).toBe(
      "forms.errorEmailSubjectMissing",
    );
  });

  it("limits the subject and the body", () => {
    expect(
      emailTemplateProblem(template("x".repeat(EMAIL_SUBJECT_MAX_LENGTH))),
    ).toBeNull();
    expect(
      emailTemplateProblem(template("x".repeat(EMAIL_SUBJECT_MAX_LENGTH + 1))),
    ).toBe("forms.errorEmailSubjectTooLong");
    expect(
      emailTemplateProblem(
        template("S", "x".repeat(EMAIL_BODY_MAX_LENGTH + 1)),
      ),
    ).toBe("forms.errorEmailBodyTooLong");
  });
});

describe("sampleAnswers", () => {
  it("answers every question with a value of its kind", () => {
    const schema = {
      pages: [
        {
          name: "seite1",
          elements: [
            { type: "text", name: "vorname", title: "Vorname" },
            { type: "text", name: "mail", inputType: "email" },
            { type: "text", name: "alter", inputType: "number" },
            { type: "text", name: "tag", inputType: "date" },
            { type: "comment", name: "anmerkung" },
            { type: "boolean", name: "foto" },
            {
              type: "radiogroup",
              name: "kurs",
              choices: [{ value: "eh", text: "Erste Hilfe" }, "Sanitäter"],
            },
            { type: "checkbox", name: "tage", choices: ["Mo", "Di"] },
            { type: "rating", name: "note" },
            { type: "html", name: "hinweis" },
          ],
        },
      ],
    };

    const answers = sampleAnswers(schema);

    expect(answers).toEqual({
      vorname: "Beispielantwort",
      mail: "erika.mustermann@example.org",
      alter: 42,
      tag: "2026-10-07",
      anmerkung: "Beispieltext",
      foto: true,
      kurs: "eh",
      tage: ["Mo"],
      note: 4,
    });
    // The preview shows choice texts, as the email does.
    expect(answersTable(schema, answers)).toContain("Erste Hilfe");
  });
});
