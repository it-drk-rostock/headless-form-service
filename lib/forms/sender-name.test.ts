import { describe, expect, it } from "vitest";
import { SENDER_NAME_MAX_LENGTH, senderNameProblem } from "./sender-name.ts";

describe("senderNameProblem", () => {
  it("accepts no name, which means the service's own", () => {
    expect(senderNameProblem("")).toBeNull();
  });

  it("accepts a name up to the maximum length", () => {
    expect(senderNameProblem("x".repeat(SENDER_NAME_MAX_LENGTH))).toBeNull();
  });

  it("rejects a name that is too long", () => {
    expect(senderNameProblem("x".repeat(SENDER_NAME_MAX_LENGTH + 1))).toBe(
      "forms.errorSenderNameTooLong",
    );
  });
});
