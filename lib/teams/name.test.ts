import { describe, expect, it } from "vitest";
import { teamNameProblem } from "./name.ts";

describe("teamNameProblem", () => {
  it("accepts a name of up to 100 characters", () => {
    expect(teamNameProblem("Blutspende")).toBeNull();
    expect(teamNameProblem("x".repeat(100))).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(teamNameProblem("")).toBe("teams.errorNameMissing");
    expect(teamNameProblem("   ")).toBe("teams.errorNameMissing");
  });

  it("rejects a name longer than 100 characters", () => {
    expect(teamNameProblem("x".repeat(101))).toBe("teams.errorNameTooLong");
  });
});
