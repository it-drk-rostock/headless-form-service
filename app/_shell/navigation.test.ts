import { describe, expect, it } from "vitest";
import { activeModule } from "./navigation.ts";

describe("activeModule", () => {
  it("finds the module whose route the path is in", () => {
    expect(activeModule("/forms")?.id).toBe("forms");
    expect(activeModule("/forms/abc-123")?.id).toBe("forms");
    expect(activeModule("/teams")?.id).toBe("teams");
    expect(activeModule("/teams/42")?.id).toBe("teams");
  });

  it("does not match a path that only shares a prefix", () => {
    expect(activeModule("/formsx")).toBeUndefined();
  });

  it("finds no module outside the module routes", () => {
    expect(activeModule("/")).toBeUndefined();
  });
});
