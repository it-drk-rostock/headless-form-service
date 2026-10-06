import { describe, expect, it } from "vitest";
import { actorName, describeAuditEntry } from "./describe.ts";

describe("describeAuditEntry", () => {
  it("names an added member and their role", () => {
    expect(
      describeAuditEntry({
        action: "member.added",
        details: { email: "eve@drk-rostock.de", role: "member" },
      }),
    ).toEqual({
      action: "Mitglied hinzugefügt",
      summary: "eve@drk-rostock.de als Mitglied",
    });
  });

  it("shows a role change from old to new", () => {
    expect(
      describeAuditEntry({
        action: "member.role_changed",
        details: {
          email: "max@drk-rostock.de",
          from: "member",
          to: "team_admin",
        },
      }),
    ).toEqual({
      action: "Rolle geändert",
      summary: "max@drk-rostock.de: Mitglied → Team-Admin",
    });
  });

  it("names a removed member and the role they had", () => {
    expect(
      describeAuditEntry({
        action: "member.removed",
        details: { email: "max@drk-rostock.de", role: "team_admin" },
      }),
    ).toEqual({
      action: "Mitglied entfernt",
      summary: "max@drk-rostock.de (Team-Admin)",
    });
  });

  it("names a member whose account is gone", () => {
    expect(
      describeAuditEntry({
        action: "member.removed",
        details: { email: null, role: "member" },
      }).summary,
    ).toBe("Gelöschtes Konto (Mitglied)");
  });

  it("names a created form", () => {
    expect(
      describeAuditEntry({
        action: "form.created",
        details: { name: "Kursanmeldung" },
      }),
    ).toEqual({ action: "Formular angelegt", summary: "Kursanmeldung" });
  });

  it("shows a rename from old to new", () => {
    expect(
      describeAuditEntry({
        action: "form.renamed",
        details: { from: "Kursanmeldung", to: "Kurse" },
      }),
    ).toEqual({
      action: "Formular umbenannt",
      summary: "Kursanmeldung → Kurse",
    });
  });

  it("shows which recipients were added and removed", () => {
    expect(
      describeAuditEntry({
        action: "form.recipients_changed",
        details: {
          name: "Kurse",
          from: ["alt@drk-rostock.de", "bleibt@drk-rostock.de"],
          to: ["bleibt@drk-rostock.de", "neu@drk-rostock.de"],
        },
      }),
    ).toEqual({
      action: "Empfänger geändert",
      summary: "Kurse: + neu@drk-rostock.de, − alt@drk-rostock.de",
    });
  });

  it("shows a reordered list as the new list", () => {
    expect(
      describeAuditEntry({
        action: "form.recipients_changed",
        details: {
          name: "Kurse",
          from: ["a@drk-rostock.de", "b@drk-rostock.de"],
          to: ["b@drk-rostock.de", "a@drk-rostock.de"],
        },
      }).summary,
    ).toBe("Kurse: b@drk-rostock.de, a@drk-rostock.de");
  });

  it("describes publishing by form name and version", () => {
    expect(
      describeAuditEntry({
        action: "form.published",
        details: { name: "Kontakt", version: 3, changelog: "Neue Frage" },
      }),
    ).toEqual({
      action: "Formular veröffentlicht",
      summary: "Kontakt: Version 3",
    });
  });

  it.each([
    [false, "Kontakt: ausgeschaltet"],
    [true, "Kontakt: eingeschaltet"],
  ])("describes switching Turnstile (on: %s)", (enabled, summary) => {
    expect(
      describeAuditEntry({
        action: "form.turnstile_changed",
        details: { name: "Kontakt", enabled },
      }),
    ).toEqual({ action: "Bot-Schutz geändert", summary });
  });

  it("shows actions it does not know yet as they are stored", () => {
    expect(
      describeAuditEntry({
        action: "form.closed",
        details: { name: "Kontakt", closed: true },
      }),
    ).toEqual({
      action: "form.closed",
      summary: "name: Kontakt, closed: true",
    });
  });
});

describe("actorName", () => {
  it("is the address the actor had when they acted", () => {
    expect(actorName({ actorEmail: "anna@drk-rostock.de" })).toBe(
      "anna@drk-rostock.de",
    );
  });

  it("is the system when nobody was signed in", () => {
    expect(actorName({ actorEmail: null })).toBe("System");
  });
});
