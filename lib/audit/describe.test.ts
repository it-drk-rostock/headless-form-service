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

  it("shows actions it does not know yet as they are stored", () => {
    expect(
      describeAuditEntry({
        action: "form.published",
        details: { version: 3, name: "Kontakt" },
      }),
    ).toEqual({
      action: "form.published",
      summary: "version: 3, name: Kontakt",
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
