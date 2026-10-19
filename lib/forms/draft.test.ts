import { describe, expect, it } from "vitest";
import {
  type DraftContent,
  draftSchemaProblem,
  hasUnpublishedChanges,
  toDraftStamp,
} from "./draft.ts";

describe("hasUnpublishedChanges", () => {
  const published: DraftContent = {
    schema: {
      elements: [
        { type: "text", name: "first" },
        { type: "text", name: "second" },
      ],
    },
    emailTemplate: { mode: "standard", subject: "Subject", body: "Body" },
    theme: null,
  };

  it("allows a first publication and detects existing unpublished edits", () => {
    expect(hasUnpublishedChanges(published, null)).toBe(true);
    expect(
      hasUnpublishedChanges(
        { ...published, schema: { title: "Changed" } },
        published,
      ),
    ).toBe(true);
    expect(
      hasUnpublishedChanges(
        {
          ...published,
          emailTemplate: { ...published.emailTemplate, body: "Changed" },
        },
        published,
      ),
    ).toBe(true);
    expect(
      hasUnpublishedChanges(
        { ...published, theme: { themeName: "custom" } },
        published,
      ),
    ).toBe(true);
  });

  it("ignores JSON object key order, including nested questions", () => {
    const reordered = {
      ...published,
      schema: {
        elements: [
          { name: "first", type: "text" },
          { name: "second", type: "text" },
        ],
      },
    };
    expect(hasUnpublishedChanges(reordered, published)).toBe(false);
  });

  it("detects question reordering and removed properties", () => {
    expect(
      hasUnpublishedChanges(
        {
          ...published,
          schema: {
            elements: [
              { type: "text", name: "second" },
              { type: "text", name: "first" },
            ],
          },
        },
        published,
      ),
    ).toBe(true);
    expect(hasUnpublishedChanges({ ...published, schema: {} }, published)).toBe(
      true,
    );
  });

  it("returns to unchanged when edits are undone, discarded, or just published", () => {
    expect(hasUnpublishedChanges(structuredClone(published), published)).toBe(
      false,
    );
  });
});

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
