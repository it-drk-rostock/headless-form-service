import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from "./password.ts";

const longEnough = "x".repeat(MIN_PASSWORD_LENGTH);

describe("newPasswordProblem", () => {
  it("accepts a long enough password typed twice", () => {
    expect(newPasswordProblem(longEnough, longEnough)).toBeNull();
  });

  it("rejects a password shorter than the minimum", () => {
    const short = longEnough.slice(1);
    expect(newPasswordProblem(short, short)).toBe("auth.errorPasswordTooShort");
  });

  it("rejects a confirmation that does not match", () => {
    expect(newPasswordProblem(longEnough, `${longEnough}y`)).toBe(
      "auth.errorPasswordMismatch",
    );
  });
});
