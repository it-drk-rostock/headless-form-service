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

  it("describes restoring a version into the draft", () => {
    expect(
      describeAuditEntry({
        action: "form.version_restored",
        details: { name: "Kontakt", version: 2 },
      }),
    ).toEqual({
      action: "Version wiederhergestellt",
      summary: "Kontakt: Version 2 in den Entwurf übernommen",
    });
  });

  it("describes discarding the draft's changes", () => {
    expect(
      describeAuditEntry({
        action: "form.draft_discarded",
        details: { name: "Kontakt", version: 3 },
      }),
    ).toEqual({
      action: "Änderungen verworfen",
      summary: "Kontakt: Entwurf auf Version 3 zurückgesetzt",
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

  it.each([
    ["email", null, "Kontakt: email → keine"],
    [null, "chefin", "Kontakt: keine → chefin"],
  ])("describes changing the Reply-To question (%s → %s)", (from, to, summary) => {
    expect(
      describeAuditEntry({
        action: "form.reply_to_changed",
        details: { name: "Kontakt", from, to },
      }),
    ).toEqual({ action: "Antwortadresse geändert", summary });
  });

  it("describes a sender name change, an empty name as the service's own", () => {
    expect(
      describeAuditEntry({
        action: "form.sender_name_changed",
        details: { name: "Kontakt", from: "", to: "DRK Kurse" },
      }),
    ).toEqual({
      action: "Absendername geändert",
      summary: "Kontakt: DRK Rostock Formular-Service → DRK Kurse",
    });
  });

  it("shows which allowed origins were added and removed", () => {
    expect(
      describeAuditEntry({
        action: "settings.origins_changed",
        details: {
          from: ["http://localhost:3000"],
          to: ["http://localhost:3000", "https://www.drk-rostock.de"],
        },
      }),
    ).toEqual({
      action: "Erlaubte Websites geändert",
      summary: "+ https://www.drk-rostock.de",
    });
  });

  it("shows which allowed recipient domains were added and removed", () => {
    expect(
      describeAuditEntry({
        action: "settings.recipient_domains_changed",
        details: {
          from: ["drk-rostock.de", "gmail.com"],
          to: ["drk-rostock.de", "kv.drk-rostock.de"],
        },
      }),
    ).toEqual({
      action: "Erlaubte Empfänger-Domains geändert",
      summary: "+ kv.drk-rostock.de, − gmail.com",
    });
  });

  it("shows an emptied origin list", () => {
    expect(
      describeAuditEntry({
        action: "settings.origins_changed",
        details: { from: ["https://a.de"], to: [] },
      }).summary,
    ).toBe("− https://a.de");
  });

  it.each([
    [
      "settings.load_limit_changed",
      "Aufruf-Limit geändert",
      "60 → 120 pro Minute und IP",
    ],
    [
      "settings.submit_limit_changed",
      "Einsende-Limit geändert",
      "60 → 120 pro Stunde und IP",
    ],
  ])("describes a rate limit change (%s)", (action, label, summary) => {
    expect(
      describeAuditEntry({ action, details: { from: 60, to: 120 } }),
    ).toEqual({ action: label, summary });
  });

  it.each([
    ["form.closed", "Formular geschlossen", "Kontakt"],
    ["form.reopened", "Formular wieder geöffnet", "Kontakt"],
  ])("describes closing and reopening (%s)", (action, label, summary) => {
    expect(
      describeAuditEntry({ action, details: { name: "Kontakt" } }),
    ).toEqual({ action: label, summary });
  });

  it.each([
    ["form.archived", "Formular archiviert", "Kontakt"],
    ["form.unarchived", "Formular aus dem Archiv geholt", "Kontakt"],
    ["form.deleted", "Formular endgültig gelöscht", "Kontakt"],
  ])("describes archiving and deleting (%s)", (action, label, summary) => {
    expect(
      describeAuditEntry({ action, details: { name: "Kontakt" } }),
    ).toEqual({ action: label, summary });
  });

  it("names the new access type", () => {
    expect(
      describeAuditEntry({
        action: "form.access_changed",
        details: { name: "Kontakt", to: "protected" },
      }),
    ).toEqual({ action: "Zugang geändert", summary: "Kontakt: geschützt" });
    expect(
      describeAuditEntry({
        action: "form.access_changed",
        details: { name: "Kontakt", to: "public" },
      }).summary,
    ).toBe("Kontakt: öffentlich");
  });

  it("shows a form page change from old to new", () => {
    expect(
      describeAuditEntry({
        action: "form.page_changed",
        details: {
          name: "Kontakt",
          from: null,
          to: "https://www.drk-rostock.de/kontakt",
        },
      }),
    ).toEqual({
      action: "Formularseite geändert",
      summary: "Kontakt: keine → https://www.drk-rostock.de/kontakt",
    });
  });

  it("describes a created form pass with its limits", () => {
    expect(
      describeAuditEntry({
        action: "form_pass.created",
        details: {
          name: "Kontakt",
          max_uses: 1,
          expires_at: "2026-10-09T22:30:00+00:00",
          source: "dashboard",
        },
      }),
    ).toEqual({
      action: "Pass angelegt",
      summary: "Kontakt: 1 Nutzung(en), gültig bis 10.10.2026, 00:30",
    });
    expect(
      describeAuditEntry({
        action: "form_pass.created",
        details: {
          name: "Kontakt",
          max_uses: null,
          expires_at: null,
          source: "n8n",
        },
      }).summary,
    ).toBe("Kontakt: unbegrenzte Nutzungen, ohne Ablauf, über n8n");
  });

  it("names the form of a revoked pass", () => {
    expect(
      describeAuditEntry({
        action: "form_pass.revoked",
        details: { name: "Kontakt" },
      }),
    ).toEqual({ action: "Pass widerrufen", summary: "Kontakt" });
  });

  it("shows actions it does not know yet as they are stored", () => {
    expect(
      describeAuditEntry({
        action: "pass.created",
        details: { name: "Kontakt", uses: 1 },
      }),
    ).toEqual({
      action: "pass.created",
      summary: "name: Kontakt, uses: 1",
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
