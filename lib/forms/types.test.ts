import { describe, expect, it } from "vitest";
import { formStatus, formView } from "./types.ts";

const open = { archivedAt: null, isClosed: false, currentVersion: null };

describe("formStatus", () => {
  it("is a draft until the first publish", () => {
    expect(formStatus(open)).toBe("draft");
  });

  it("is published once there is a current version", () => {
    expect(formStatus({ ...open, currentVersion: 2 })).toBe("published");
  });

  it("is closed while closed, published or not", () => {
    expect(formStatus({ ...open, isClosed: true })).toBe("closed");
    expect(formStatus({ ...open, isClosed: true, currentVersion: 1 })).toBe(
      "closed",
    );
  });

  it("is archived above all", () => {
    expect(
      formStatus({
        archivedAt: "2026-10-05T10:00:00Z",
        isClosed: true,
        currentVersion: 1,
      }),
    ).toBe("archived");
  });
});

describe("formView", () => {
  it("opens the view the URL names", () => {
    expect(formView("settings")).toBe("settings");
    expect(formView("designer")).toBe("designer");
    expect(formView("email")).toBe("email");
    expect(formView("versions")).toBe("versions");
  });

  it("falls back to the designer", () => {
    expect(formView(undefined)).toBe("designer");
    expect(formView("unbekannt")).toBe("designer");
    expect(formView(["settings", "designer"])).toBe("designer");
  });
});
