import { describe, expect, it } from "vitest";
import { decryptPassContext, encryptPassContext } from "./pass-context.ts";
import { parseEncryptionKeys } from "./submission-crypto.ts";

describe("encrypted pass context", () => {
  it("round-trips personal data and rejects ciphertext moved to another pass or form", async () => {
    const keys = await parseEncryptionKeys(
      "test:q0NrH1tZr0b2jXg6v7m3o4P0cF8sW2yLkV9eRzT1uYI=",
    );
    const context = {
      prefill: { email: "max@example.org" },
      locked_fields: ["email"],
      recipient: "kurse@example.org",
    };
    const envelope = await encryptPassContext(keys, "form", "hash", context);
    expect(JSON.stringify(envelope)).not.toContain("max@example.org");
    expect(await decryptPassContext(keys, "form", "hash", envelope)).toEqual(
      context,
    );
    await expect(
      decryptPassContext(keys, "other-form", "hash", envelope),
    ).rejects.toThrow();
    await expect(
      decryptPassContext(keys, "form", "other-hash", envelope),
    ).rejects.toThrow();
    await expect(
      decryptPassContext(keys, "form", "hash", {
        ...envelope,
        ct: `AAAA${envelope.ct.slice(4)}`,
      }),
    ).rejects.toThrow();
  });
});
