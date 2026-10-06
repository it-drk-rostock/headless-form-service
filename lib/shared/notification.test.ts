import { describe, expect, it } from "vitest";
import {
  answersTable,
  escapeHtml,
  formatSubmittedAt,
  parseEmailTemplate,
  renderNotificationEmail,
} from "./notification.ts";

const page = (...elements: unknown[]) => ({
  pages: [{ name: "seite1", elements }],
});

const SUBMITTED_AT = new Date("2026-10-06T12:30:00Z");

describe("escapeHtml", () => {
  it("escapes every character that could open markup or leave an attribute", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("formatSubmittedAt", () => {
  it("formats in German, in Rostock's time zone", () => {
    expect(formatSubmittedAt(SUBMITTED_AT)).toBe("06.10.2026, 14:30");
    expect(formatSubmittedAt(new Date("2026-01-15T08:05:00Z"))).toBe(
      "15.01.2026, 09:05",
    );
  });
});

describe("answersTable", () => {
  it("lists non-empty answers in question order, labelled with the question's title", () => {
    const schema = page(
      { type: "text", name: "vorname", title: "Vorname" },
      { type: "text", name: "nachname" },
      { type: "text", name: "telefon", title: "Telefon" },
      { type: "comment", name: "anmerkung", title: "Anmerkung" },
    );

    const rows = rowsOf(
      answersTable(schema, {
        nachname: "Mustermann",
        vorname: "Erika",
        telefon: "",
        anmerkung: "   ",
      }),
    );

    expect(rows).toEqual([
      ["Vorname", "Erika"],
      ["nachname", "Mustermann"],
    ]);
  });

  it("escapes titles and answers", () => {
    const schema = page({
      type: "text",
      name: "frage",
      title: "<i>Frage</i>",
    });

    const html = answersTable(schema, {
      frage: `<script>alert("x")</script>`,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;i&gt;Frage&lt;/i&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("keeps line breaks of long answers", () => {
    const schema = page({ type: "comment", name: "anmerkung" });

    expect(
      rowsOf(answersTable(schema, { anmerkung: "Zeile 1\nZeile <2>" })),
    ).toEqual([["anmerkung", "Zeile 1<br>Zeile &lt;2&gt;"]]);
  });

  it("uses the German title of a localized question", () => {
    const schema = page({
      type: "text",
      name: "vorname",
      title: { default: "First name", de: "Vorname" },
    });

    expect(rowsOf(answersTable(schema, { vorname: "Erika" }))).toEqual([
      ["Vorname", "Erika"],
    ]);
  });

  it("shows choices by their text, and an other-text after the choice", () => {
    const schema = page(
      {
        type: "radiogroup",
        name: "kurs",
        title: "Kurs",
        choices: [{ value: "eh", text: "Erste Hilfe" }, "Sanitätsdienst"],
        showOtherItem: true,
      },
      {
        type: "checkbox",
        name: "tage",
        title: "Tage",
        choices: [
          { value: 1, text: "Montag" },
          { value: 2, text: "Dienstag" },
        ],
      },
    );

    expect(
      rowsOf(
        answersTable(schema, {
          kurs: "other",
          "kurs-Comment": "Rettungsschwimmen",
          tage: [1, 2],
        }),
      ),
    ).toEqual([
      ["Kurs", "Sonstiges: Rettungsschwimmen"],
      ["Tage", "Montag, Dienstag"],
    ]);
    expect(rowsOf(answersTable(schema, { kurs: "eh" }))).toEqual([
      ["Kurs", "Erste Hilfe"],
    ]);
  });

  it("shows yes/no, numbers in German, and nested answers as key: value", () => {
    const schema = page(
      { type: "boolean", name: "einverstanden", title: "Einverstanden" },
      { type: "text", inputType: "number", name: "betrag", title: "Betrag" },
      {
        type: "multipletext",
        name: "adresse",
        title: "Adresse",
        items: [{ name: "ort" }, { name: "plz" }],
      },
    );

    expect(
      rowsOf(
        answersTable(schema, {
          einverstanden: false,
          betrag: 1234.5,
          adresse: { ort: "Rostock", plz: "18055" },
        }),
      ),
    ).toEqual([
      ["Einverstanden", "Nein"],
      ["Betrag", "1.234,5"],
      ["Adresse", "ort: Rostock; plz: 18055"],
    ]);
  });

  it("finds questions inside panels and on later pages", () => {
    const schema = {
      pages: [
        {
          name: "seite1",
          elements: [
            {
              type: "panel",
              name: "person",
              elements: [{ type: "text", name: "vorname" }],
            },
          ],
        },
        { name: "seite2", elements: [{ type: "text", name: "ort" }] },
      ],
    };

    expect(
      rowsOf(answersTable(schema, { ort: "Rostock", vorname: "Erika" })),
    ).toEqual([
      ["vorname", "Erika"],
      ["ort", "Rostock"],
    ]);
  });

  it("reads a question's answer under its valueName", () => {
    const schema = page({
      type: "text",
      name: "frage1",
      valueName: "email",
      title: "E-Mail",
    });

    expect(
      rowsOf(answersTable(schema, { email: "erika@example.org" })),
    ).toEqual([["E-Mail", "erika@example.org"]]);
  });

  it("shows an answer shared by two questions once", () => {
    const schema = page(
      { type: "text", name: "email", title: "E-Mail" },
      { type: "text", name: "email2", valueName: "email", title: "Nochmal" },
    );

    expect(
      rowsOf(answersTable(schema, { email: "erika@example.org" })),
    ).toEqual([["E-Mail", "erika@example.org"]]);
  });

  it("says so when nothing was answered", () => {
    expect(answersTable(page({ type: "text", name: "vorname" }), {})).toBe(
      "<p>Keine Angaben.</p>",
    );
  });
});

describe("renderNotificationEmail", () => {
  const context = {
    formName: `Kurs & "Anmeldung" <neu>`,
    submittedAt: SUBMITTED_AT,
    schema: page({ type: "text", name: "vorname", title: "Vorname" }),
    answers: { vorname: "<b>Erika</b>" },
  };

  it("fills the placeholders of subject and body, escaping every value in the body", () => {
    const { subject, html } = renderNotificationEmail(
      {
        mode: "standard",
        subject: "Neu: {{form.name}} ({{ submitted_at }})",
        body: "<p>{{form.name}} am {{submitted_at}}</p>{{answers_table}}",
      },
      context,
    );

    expect(subject).toBe(`Neu: Kurs & "Anmeldung" <neu> (06.10.2026, 14:30)`);
    expect(html).toContain(
      "<p>Kurs &amp; &quot;Anmeldung&quot; &lt;neu&gt; am 06.10.2026, 14:30</p>",
    );
    expect(html).toContain("&lt;b&gt;Erika&lt;/b&gt;");
    expect(html).not.toContain("<b>Erika</b>");
    expect(html).not.toContain("<neu>");
    expect(html).toMatch(/^<!doctype html>/);
  });

  it("does not let an inserted value introduce another placeholder", () => {
    const { html } = renderNotificationEmail(
      { mode: "standard", subject: "{{form.name}}", body: "{{form.name}}" },
      { ...context, formName: "{{answers_table}}" },
    );

    expect(html).toContain("{{answers_table}}");
    expect(html).not.toContain("<table");
  });

  it("keeps the subject on one line and leaves out the answers table there", () => {
    const { subject } = renderNotificationEmail(
      {
        mode: "standard",
        subject: "{{form.name}}\r\nBcc: x@example.org {{answers_table}}",
        body: "",
      },
      { ...context, formName: "Kurs\nanmeldung" },
    );

    expect(subject).toBe("Kurs anmeldung Bcc: x@example.org");
  });

  it("leaves placeholders it does not know untouched", () => {
    const { html } = renderNotificationEmail(
      {
        mode: "standard",
        subject: "",
        body: "<p>{{answers.vorname}} {{unbekannt}}</p>",
      },
      context,
    );

    expect(html).toContain("<p>{{answers.vorname}} {{unbekannt}}</p>");
  });
});

describe("parseEmailTemplate", () => {
  it("reads a version's template", () => {
    expect(
      parseEmailTemplate({ mode: "standard", subject: "S", body: "<p>B</p>" }),
    ).toEqual({ mode: "standard", subject: "S", body: "<p>B</p>" });
  });

  it.each([
    ["no object", "text"],
    ["no subject", { mode: "standard", body: "" }],
    ["no body", { mode: "standard", subject: "" }],
    ["an unknown mode", { mode: "mjml", subject: "", body: "" }],
  ])("refuses %s", (_, value) => {
    expect(parseEmailTemplate(value)).toBeNull();
  });
});

/** The answers table's rows as [label, value HTML]. */
function rowsOf(html: string): [string, string][] {
  return [...html.matchAll(/<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>/g)].map(
    ([, label, value]) => [label, value],
  );
}
