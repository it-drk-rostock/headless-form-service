import { describe, expect, it } from "vitest";
import { draftSchemaProblem, toDraftStamp } from "./draft.ts";

const page = (...elements: unknown[]) => ({
  pages: [{ name: "seite1", elements }],
});

describe("draftSchemaProblem", () => {
  it("accepts an empty draft and ordinary questions", () => {
    expect(draftSchemaProblem({})).toBeNull();
    expect(
      draftSchemaProblem(
        page(
          { type: "text", name: "file", title: "signaturepad" },
          { type: "comment", name: "x", validators: [{ type: "regex" }] },
        ),
      ),
    ).toBeNull();
  });

  it("rejects anything but a JSON object", () => {
    expect(draftSchemaProblem(null)).toBe("forms.errorDraftInvalid");
    expect(draftSchemaProblem([])).toBe("forms.errorDraftInvalid");
    expect(draftSchemaProblem("{}")).toBe("forms.errorDraftInvalid");
  });

  it("rejects file and signature questions, however deeply nested", () => {
    expect(draftSchemaProblem(page({ type: "file", name: "a" }))).toBe(
      "forms.errorDraftQuestionType",
    );
    expect(
      draftSchemaProblem(
        page({
          type: "paneldynamic",
          name: "p",
          templateElements: [
            { type: "panel", elements: [{ type: "SignaturePad", name: "s" }] },
          ],
        }),
      ),
    ).toBe("forms.errorDraftQuestionType");
  });
});

describe("toDraftStamp", () => {
  const created = "2026-10-05T09:00:00Z";
  const at = "2026-10-05T10:00:00Z";

  it("names the editor by full name, else by email", () => {
    expect(
      toDraftStamp({
        created_at: created,
        draft_updated_at: at,
        editor: { full_name: "Max Muster", email: "max@drk-rostock.de" },
      }),
    ).toEqual({ savedAt: at, savedBy: "Max Muster" });
    expect(
      toDraftStamp({
        created_at: created,
        draft_updated_at: at,
        editor: { full_name: "", email: "max@drk-rostock.de" },
      }),
    ).toEqual({ savedAt: at, savedBy: "max@drk-rostock.de" });
  });

  it("names nobody when the editor is gone or not visible", () => {
    expect(
      toDraftStamp({ created_at: created, draft_updated_at: at, editor: null }),
    ).toEqual({ savedAt: at, savedBy: null });
  });

  it("has no save time for a draft nobody has saved yet", () => {
    expect(
      toDraftStamp({
        created_at: created,
        draft_updated_at: created,
        editor: null,
      }),
    ).toEqual({ savedAt: null, savedBy: null });
  });
});
