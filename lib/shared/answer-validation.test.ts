import { describe, expect, it } from "vitest";
import { answerProblems } from "./answer-validation.ts";

const page = (...elements: unknown[]) => ({
  pages: [{ name: "seite1", elements }],
});

describe("answerProblems", () => {
  it("finds nothing wrong with complete answers of the right types", () => {
    const schema = page(
      { type: "text", name: "vorname", isRequired: true },
      { type: "text", name: "alter", inputType: "number" },
      { type: "comment", name: "nachricht" },
      { type: "radiogroup", name: "anrede", showOtherItem: true },
      { type: "dropdown", name: "kurs" },
      { type: "checkbox", name: "tage", isRequired: true },
      { type: "tagbox", name: "themen" },
      { type: "ranking", name: "reihenfolge" },
      { type: "boolean", name: "einverstanden", isRequired: true },
      { type: "rating", name: "zufrieden" },
      { type: "matrix", name: "bewertung" },
      { type: "matrixdropdown", name: "einsatz" },
      { type: "matrixdynamic", name: "teilnehmer" },
      { type: "multipletext", name: "adresse" },
      { type: "paneldynamic", name: "kinder" },
      { type: "imagepicker", name: "motiv" },
      { type: "imagepicker", name: "motive", multiSelect: true },
      { type: "signaturepad", name: "unterschrift" },
      { type: "file", name: "anhang" },
    );

    expect(
      answerProblems(schema, {
        vorname: "Erika",
        alter: 42,
        nachricht: "Hallo",
        anrede: "other",
        "anrede-Comment": "Divers",
        kurs: 3,
        tage: ["Mo", "Di"],
        themen: ["Erste Hilfe"],
        reihenfolge: ["a", "b"],
        einverstanden: false,
        zufrieden: 5,
        bewertung: { essen: "gut" },
        einsatz: { tag1: { schicht: "früh" } },
        teilnehmer: [{ name: "Max" }],
        adresse: { ort: "Rostock", plz: 18055 },
        kinder: [{ kindname: "Max" }],
        motiv: "lion",
        motive: ["lion", "cat"],
        unterschrift: "data:image/png;base64,AAAA",
        anhang: [{ name: "a.pdf", type: "application/pdf", content: "x" }],
      }),
    ).toEqual([]);
  });

  it.each([
    ["missing", {}],
    ["an empty text", { vorname: "" }],
    ["null", { vorname: null }],
  ])("reports a required question that is %s", (_, answers) => {
    const schema = page({ type: "text", name: "vorname", isRequired: true });

    expect(answerProblems(schema, answers)).toEqual([
      { key: "vorname", problem: "required" },
    ]);
  });

  it("reports an empty selection or an empty matrix as missing", () => {
    const schema = page(
      { type: "checkbox", name: "tage", isRequired: true },
      { type: "matrix", name: "bewertung", isRequired: true },
    );

    expect(answerProblems(schema, { tage: [], bewertung: {} })).toEqual([
      { key: "tage", problem: "required" },
      { key: "bewertung", problem: "required" },
    ]);
  });

  it("counts a 'no' as an answer to a required yes/no question", () => {
    const schema = page({ type: "boolean", name: "ok", isRequired: true });

    expect(answerProblems(schema, { ok: false })).toEqual([]);
  });

  it("checks required questions inside panels and on later pages", () => {
    const schema = {
      pages: [
        { name: "seite1", elements: [{ type: "text", name: "vorname" }] },
        {
          name: "seite2",
          elements: [
            {
              type: "panel",
              name: "adresse",
              elements: [{ type: "text", name: "ort", isRequired: true }],
            },
          ],
        },
      ],
    };

    expect(answerProblems(schema, { vorname: "Erika" })).toEqual([
      { key: "ort", problem: "required" },
    ]);
  });

  // Whether these are shown depends on other answers, which only SurveyJS can
  // evaluate. The embed checks them; the server lets them through.
  it.each([
    ["has a condition", { visibleIf: "{a} = 1" }],
    ["is hidden", { visible: false }],
    ["is read-only", { readOnly: true }],
    ["can be disabled", { enableIf: "{a} = 1" }],
    ["hides itself without choices", { hideIfChoicesEmpty: true }],
  ])("does not require a question that %s", (_, condition) => {
    const schema = page({
      type: "text",
      name: "vorname",
      isRequired: true,
      ...condition,
    });

    expect(answerProblems(schema, {})).toEqual([]);
  });

  it("does not require questions inside a conditional panel or page", () => {
    const schema = {
      pages: [
        {
          name: "seite1",
          elements: [
            {
              type: "panel",
              name: "adresse",
              visibleIf: "{a} = 1",
              elements: [{ type: "text", name: "ort", isRequired: true }],
            },
          ],
        },
        {
          name: "seite2",
          visibleIf: "{a} = 1",
          elements: [{ type: "text", name: "plz", isRequired: true }],
        },
      ],
    };

    expect(answerProblems(schema, {})).toEqual([]);
  });

  it.each([
    "complete",
    "skip",
  ])("does not require questions when a %s trigger can pass them by", (type) => {
    const schema = {
      ...page({ type: "text", name: "vorname", isRequired: true }),
      triggers: [{ type, expression: "{a} = 1" }],
    };

    expect(answerProblems(schema, {})).toEqual([]);
  });

  it("still requires questions when triggers only set values", () => {
    const schema = {
      ...page({ type: "text", name: "vorname", isRequired: true }),
      triggers: [{ type: "setvalue", expression: "{a} = 1" }],
    };

    expect(answerProblems(schema, {})).toEqual([
      { key: "vorname", problem: "required" },
    ]);
  });

  it("accepts selected choices stored as objects", () => {
    const schema = page({
      type: "checkbox",
      name: "obst",
      valuePropertyName: "frucht",
    });

    expect(answerProblems(schema, { obst: [{ frucht: "Apfel" }] })).toEqual([]);
  });

  it("lets an expression compute any value", () => {
    const schema = page({ type: "expression", name: "summe" });

    expect(answerProblems(schema, { summe: ["a", "b"] })).toEqual([]);
  });

  it("still checks the type of a conditional question's answer", () => {
    const schema = page({ type: "text", name: "vorname", visibleIf: "{a}" });

    expect(answerProblems(schema, { vorname: { x: 1 } })).toEqual([
      { key: "vorname", problem: "type" },
    ]);
  });

  it.each([
    ["text", {}, { not: "text" }],
    ["text", {}, ["a"]],
    ["comment", {}, 5],
    ["radiogroup", {}, ["a"]],
    ["dropdown", {}, { a: 1 }],
    ["checkbox", {}, "Mo"],
    ["checkbox", {}, [["Mo"]]],
    ["tagbox", {}, "a"],
    ["ranking", {}, "a"],
    ["boolean", {}, "ja"],
    ["rating", {}, [5]],
    ["matrix", {}, ["gut"]],
    ["matrix", {}, { essen: { a: 1 } }],
    ["matrixdropdown", {}, { tag1: "früh" }],
    ["matrixdynamic", {}, { name: "Max" }],
    ["matrixdynamic", {}, ["Max"]],
    ["multipletext", {}, { ort: ["Rostock"] }],
    ["paneldynamic", {}, { kindname: "Max" }],
    ["imagepicker", {}, ["lion"]],
    ["imagepicker", { multiSelect: true }, "lion"],
    ["signaturepad", {}, 1],
    ["file", {}, "a.pdf"],
  ])("reports a %s question %j answered with %j", (type, extra, value) => {
    const schema = page({ type, name: "frage", ...extra });

    expect(answerProblems(schema, { frage: value })).toEqual([
      { key: "frage", problem: "type" },
    ]);
  });

  it("accepts a yes/no question's own values", () => {
    const schema = page({
      type: "boolean",
      name: "ok",
      valueTrue: "ja",
      valueFalse: "nein",
    });

    expect(answerProblems(schema, { ok: "nein" })).toEqual([]);
    expect(
      answerProblems(page({ type: "boolean", name: "ok", valueTrue: "ja" }), {
        ok: false,
      }),
    ).toEqual([]);
    expect(answerProblems(schema, { ok: "vielleicht" })).toEqual([
      { key: "ok", problem: "type" },
    ]);
  });

  it("reports a comment that is not text", () => {
    const schema = page({
      type: "dropdown",
      name: "kurs",
      showOtherItem: true,
    });

    expect(
      answerProblems(schema, { kurs: "other", "kurs-Comment": ["x"] }),
    ).toEqual([{ key: "kurs-Comment", problem: "type" }]);
  });

  it("lets any answer through for question types it does not know", () => {
    const schema = page({ type: "my-custom-widget", name: "frage" });

    expect(answerProblems(schema, { frage: { anything: [1] } })).toEqual([]);
  });

  it("uses a question's value name", () => {
    const schema = page({
      type: "text",
      name: "frage1",
      valueName: "email",
      isRequired: true,
    });

    expect(answerProblems(schema, { frage1: "x" })).toEqual([
      { key: "email", problem: "required" },
    ]);
  });
});
