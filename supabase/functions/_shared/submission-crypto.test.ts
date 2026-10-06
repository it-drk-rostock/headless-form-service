import { describe, expect, it } from "vitest";
import {
  decryptSubmission,
  encryptSubmission,
  parseEncryptionKeys,
} from "./submission-crypto.ts";

// 32 random bytes each, base64: test keys, never used anywhere else.
const KEY_A = "q0NrH1tZr0b2jXg6v7m3o4P0cF8sW2yLkV9eRzT1uYI=";
const KEY_B = "3m4Jd8bQx2Vt9rLwC6nE0hY5gKpA1sZoU7fTiMvXbNc=";

const IDS = {
  submissionId: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
  formId: "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d",
  version: 3,
};
const PAYLOAD = { answers: { vorname: "Erika" }, pass_id: null };

describe("submission encryption", () => {
  it("round-trips a submission, and the envelope hides the answers", async () => {
    const keys = await parseEncryptionKeys(`a:${KEY_A}`);

    const envelope = await encryptSubmission(keys, IDS, PAYLOAD);

    expect(Object.keys(envelope).sort()).toEqual(["ct", "iv", "kid", "v"]);
    expect(envelope).toMatchObject({ v: 1, kid: "a" });
    expect(JSON.stringify(envelope)).not.toContain("Erika");
    expect(await decryptSubmission(keys, IDS, envelope)).toEqual(PAYLOAD);
  });

  it("uses a fresh IV for every submission", async () => {
    const keys = await parseEncryptionKeys(`a:${KEY_A}`);

    const first = await encryptSubmission(keys, IDS, PAYLOAD);
    const second = await encryptSubmission(keys, IDS, PAYLOAD);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ct).not.toBe(second.ct);
  });

  it("encrypts with the first key and still decrypts with older ones", async () => {
    const old = await parseEncryptionKeys(`a:${KEY_A}`);
    const rotated = await parseEncryptionKeys(`b:${KEY_B},a:${KEY_A}`);
    const queuedBefore = await encryptSubmission(old, IDS, PAYLOAD);

    const queuedAfter = await encryptSubmission(rotated, IDS, PAYLOAD);

    expect(queuedAfter.kid).toBe("b");
    expect(await decryptSubmission(rotated, IDS, queuedBefore)).toEqual(
      PAYLOAD,
    );
  });

  it("refuses a ciphertext moved to another submission", async () => {
    const keys = await parseEncryptionKeys(`a:${KEY_A}`);
    const envelope = await encryptSubmission(keys, IDS, PAYLOAD);

    for (const other of [
      { ...IDS, submissionId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" },
      { ...IDS, formId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" },
      { ...IDS, version: 4 },
    ]) {
      await expect(decryptSubmission(keys, other, envelope)).rejects.toThrow();
    }
  });

  it("refuses a ciphertext with an unknown key", async () => {
    const a = await parseEncryptionKeys(`a:${KEY_A}`);
    const b = await parseEncryptionKeys(`b:${KEY_B}`);
    const envelope = await encryptSubmission(a, IDS, PAYLOAD);

    await expect(decryptSubmission(b, IDS, envelope)).rejects.toThrow(
      "unknown submission key a",
    );
  });

  it.each([
    ["nothing", ""],
    ["a key without an ID", KEY_A],
    ["a key that is not 32 bytes", "a:c2hvcnQ="],
    ["the same ID twice", `a:${KEY_A},a:${KEY_B}`],
  ])("refuses a key list with %s", async (_, value) => {
    await expect(parseEncryptionKeys(value)).rejects.toThrow(
      "SUBMISSION_ENCRYPTION_KEYS",
    );
  });
});
