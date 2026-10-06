import { describe, expect, it } from "vitest";
import { pickAnswers } from "./answers.ts";

const page = (...elements: unknown[]) => ({
  pages: [{ name: "seite1", elements }],
});

describe("pickAnswers", () => {
  it("keeps answers to the version's questions and drops every other key", () => {
    const schema = page(
      { type: "text", name: "vorname" },
      { type: "checkbox", name: "kurse" },
    );

    expect(
      pickAnswers(schema, {
        vorname: "Erika",
        kurse: ["Erste Hilfe"],
        isAdmin: true,
        __proto__: { polluted: true },
      }),
    ).toEqual({ vorname: "Erika", kurse: ["Erste Hilfe"] });
  });

  it("finds questions on every page and inside panels", () => {
    const schema = {
      pages: [
        { name: "seite1", elements: [{ type: "text", name: "vorname" }] },
        {
          name: "seite2",
          elements: [
            {
              type: "panel",
              name: "adresse",
              elements: [{ type: "text", name: "ort" }],
            },
          ],
        },
      ],
    };

    expect(
      pickAnswers(schema, { vorname: "Erika", ort: "Rostock", adresse: "x" }),
    ).toEqual({ vorname: "Erika", ort: "Rostock" });
  });

  it("finds questions of a schema without pages", () => {
    const schema = { elements: [{ type: "text", name: "vorname" }] };

    expect(pickAnswers(schema, { vorname: "Erika", x: 1 })).toEqual({
      vorname: "Erika",
    });
  });

  it("keeps a dynamic panel's value whole, but not its inner names at the top", () => {
    const schema = page({
      type: "paneldynamic",
      name: "kinder",
      templateElements: [{ type: "text", name: "kindname" }],
    });

    expect(
      pickAnswers(schema, { kinder: [{ kindname: "Max" }], kindname: "x" }),
    ).toEqual({ kinder: [{ kindname: "Max" }] });
  });

  it("uses a question's value name and keeps its comment", () => {
    const schema = page(
      { type: "text", name: "frage1", valueName: "email" },
      { type: "dropdown", name: "kurs", showOtherItem: true },
    );

    expect(
      pickAnswers(schema, {
        email: "erika@example.org",
        frage1: "x",
        kurs: "other",
        "kurs-Comment": "Schwimmen",
      }),
    ).toEqual({
      email: "erika@example.org",
      kurs: "other",
      "kurs-Comment": "Schwimmen",
    });
  });

  it("keeps nothing for elements that take no answer", () => {
    const schema = page(
      { type: "html", name: "hinweis" },
      { type: "image", name: "logo" },
    );

    expect(pickAnswers(schema, { hinweis: "x", logo: "y" })).toEqual({});
  });
});
