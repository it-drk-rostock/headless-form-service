import { describe, expect, it } from "vitest";
import {
  CHANGELOG_MAX_LENGTH,
  changelogProblem,
  normalizeChangelog,
  toCurrentVersion,
} from "./publish.ts";

describe("normalizeChangelog", () => {
  it("trims the changelog", () => {
    expect(normalizeChangelog("  Neue Frage zum Kurstermin \n")).toBe(
      "Neue Frage zum Kurstermin",
    );
  });

  it("is no changelog when blank", () => {
    expect(normalizeChangelog("")).toBeNull();
    expect(normalizeChangelog("  \n ")).toBeNull();
  });
});

describe("changelogProblem", () => {
  it("accepts no changelog, or one up to the maximum length", () => {
    expect(changelogProblem("")).toBeNull();
    expect(
      changelogProblem(` ${"x".repeat(CHANGELOG_MAX_LENGTH)} `),
    ).toBeNull();
  });

  it("rejects a changelog that is too long", () => {
    expect(changelogProblem("x".repeat(CHANGELOG_MAX_LENGTH + 1))).toBe(
      "forms.errorChangelogTooLong",
    );
  });
});

describe("toCurrentVersion", () => {
  const row = {
    version: 3,
    changelog: "Neue Frage",
    created_at: "2026-10-05T12:00:00Z",
    schema: {
      elements: [
        { type: "text", name: "vorname" },
        { type: "text", name: "email", inputType: "email", title: "E-Mail" },
      ],
    },
  };

  it("names who published by their name, else their address", () => {
    expect(
      toCurrentVersion({
        ...row,
        publisher: { full_name: "Max Muster", email: "max@drk-rostock.de" },
      }),
    ).toEqual({
      version: 3,
      changelog: "Neue Frage",
      publishedAt: "2026-10-05T12:00:00Z",
      publishedBy: "Max Muster",
      emailQuestions: [{ name: "email", title: "E-Mail" }],
    });
    expect(
      toCurrentVersion({
        ...row,
        publisher: { full_name: "", email: "max@drk-rostock.de" },
      }).publishedBy,
    ).toBe("max@drk-rostock.de");
  });

  it("names nobody when the account is gone or not visible", () => {
    expect(
      toCurrentVersion({ ...row, publisher: null }).publishedBy,
    ).toBeNull();
  });
});
