import { describe, expect, it } from "vitest";
import { activeModule, breadcrumbs, visibleModules } from "./navigation.ts";

describe("activeModule", () => {
  it("finds the module whose route the path is in", () => {
    expect(activeModule("/forms")?.id).toBe("forms");
    expect(activeModule("/forms/abc-123")?.id).toBe("forms");
    expect(activeModule("/teams")?.id).toBe("teams");
    expect(activeModule("/teams/42")?.id).toBe("teams");
  });

  it("finds the audit log", () => {
    expect(activeModule("/audit-log")?.id).toBe("audit");
  });

  it("finds the settings", () => {
    expect(activeModule("/settings")?.id).toBe("settings");
  });

  it("does not match a path that only shares a prefix", () => {
    expect(activeModule("/formsx")).toBeUndefined();
  });

  it("finds no module outside the module routes", () => {
    expect(activeModule("/")).toBeUndefined();
  });
});

describe("breadcrumbs", () => {
  const teams = [{ id: "t-1", name: "Blutspende" }];

  it("shows only the module on a module page", () => {
    expect(breadcrumbs("/teams", teams)).toEqual([{ label: "Teams" }]);
  });

  it("adds the team name on a team page, with the module as a link", () => {
    expect(breadcrumbs("/teams/t-1", teams)).toEqual([
      { label: "Teams", href: "/teams" },
      { label: "Blutspende" },
    ]);
  });

  it("does not name a team the person cannot see", () => {
    expect(breadcrumbs("/teams/t-2", teams)).toEqual([
      { label: "Teams", href: "/teams" },
    ]);
  });

  it("shows nothing outside the modules", () => {
    expect(breadcrumbs("/", teams)).toEqual([]);
  });
});

describe("visibleModules", () => {
  it("shows the audit log and the settings to Super Admins only", () => {
    expect(visibleModules(true).map((m) => m.id)).toEqual([
      "forms",
      "teams",
      "audit",
      "settings",
    ]);
    expect(visibleModules(false).map((m) => m.id)).toEqual(["forms", "teams"]);
  });

  it("puts the settings at the bottom of the rail", () => {
    expect(
      visibleModules(true)
        .filter((m) => m.atBottom)
        .map((m) => m.id),
    ).toEqual(["settings"]);
  });
});
