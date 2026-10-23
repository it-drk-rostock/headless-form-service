import { describe, expect, it } from "vitest";
import {
  enforcePassFields,
  parsePassContext,
  prefillFitsSchema,
} from "./pass-context.ts";

describe("pass context", () => {
  it("locks every initial value by default and normalizes the recipient", () => {
    expect(
      parsePassContext({
        prefill: { email: "max@example.org" },
        recipient: " KURSE@EXAMPLE.ORG ",
      }),
    ).toEqual({
      prefill: { email: "max@example.org" },
      locked_fields: ["email"],
      recipient: "kurse@example.org",
    });
  });
  it.each([
    { prefill: { email: {} } },
    { prefill: { email: true } },
    { prefill: { email: "a" }, locked_fields: ["other"] },
    { recipient: "a@example.org\r\nBcc: other@example.org" },
  ])("refuses malformed input: %j", (input) =>
    expect(parsePassContext(input)).toBeNull());
  it("allows explicitly editable prefill while rejecting modified locked values", () => {
    const context = {
      prefill: { email: "max@example.org", name: "Max" },
      locked_fields: ["email"],
      recipient: null,
    };
    expect(enforcePassFields({ name: "Moritz" }, context)).toEqual({
      name: "Moritz",
      email: "max@example.org",
    });
    expect(
      enforcePassFields({ email: "attacker@example.org" }, context),
    ).toBeNull();
  });
  it("checks actual answer keys and question types", () => {
    const schema = {
      elements: [
        { type: "text", name: "display", valueName: "email" },
        { type: "checkbox", name: "choices" },
      ],
    };
    expect(
      prefillFitsSchema(schema, {
        prefill: { email: "max@example.org" },
        locked_fields: [],
        recipient: null,
      }),
    ).toBe(true);
    const invalid: Record<string, string>[] = [
      { missing: "x" },
      { choices: "x" },
    ];
    for (const prefill of invalid) {
      expect(
        prefillFitsSchema(schema, {
          prefill,
          locked_fields: [],
          recipient: null,
        }),
      ).toBe(false);
    }
  });
});
