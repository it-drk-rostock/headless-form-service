import { describe, expect, it } from "vitest";
import { parseReplyToQuestion } from "./reply-to.ts";

const choices = ["email", "chefin"];

describe("parseReplyToQuestion", () => {
  it("is none when nothing is chosen", () => {
    expect(parseReplyToQuestion("", { choices, stored: "email" })).toEqual({
      replyToQuestion: null,
    });
  });

  it("accepts an email question of the current version", () => {
    expect(parseReplyToQuestion("chefin", { choices, stored: null })).toEqual({
      replyToQuestion: "chefin",
    });
  });

  it("keeps a stored question the current version no longer has", () => {
    expect(parseReplyToQuestion("alt", { choices, stored: "alt" })).toEqual({
      replyToQuestion: "alt",
    });
  });

  it("rejects any other question", () => {
    expect(parseReplyToQuestion("vorname", { choices, stored: null })).toEqual({
      error: "forms.errorReplyToInvalid",
    });
    expect(
      parseReplyToQuestion("email", { choices: [], stored: null }),
    ).toEqual({ error: "forms.errorReplyToInvalid" });
  });
});
