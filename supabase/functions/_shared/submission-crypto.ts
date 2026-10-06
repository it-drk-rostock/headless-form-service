// Encrypts submissions before they are queued (ADR-0001): QStash keeps
// message bodies until delivery and in its dead-letter queue, so it only ever
// sees ciphertext. Only the edge functions hold the keys. AES-256-GCM through
// Web Crypto, so the module runs under Deno and under Vitest alike.

/** What a queued submission is bound to; a ciphertext moved elsewhere fails. */
export type SubmissionIds = {
  submissionId: string;
  formId: string;
  version: number;
};

/** An encrypted submission as it travels through QStash. */
export type EncryptedSubmission = {
  /** Envelope format. */
  v: 1;
  /** ID of the key it was encrypted with. */
  kid: string;
  /** Base64 of the 12-byte IV. */
  iv: string;
  /** Base64 of the ciphertext with GCM's tag. */
  ct: string;
};

/**
 * The body of a QStash message, from `/submit-form` to `/dispatch-email`:
 * IDs and ciphertext, nothing readable (ADR-0001).
 */
export type QueuedSubmission = {
  submission_id: string;
  form_id: string;
  version: number;
  encrypted: EncryptedSubmission;
};

/** What `encrypted` holds once decrypted. */
export type SubmissionPayload = {
  answers: Record<string, unknown>;
  /** The claimed form pass of a protected form (ticket 27). */
  pass_id: string | null;
};

/** The parsed `SUBMISSION_ENCRYPTION_KEYS`: the first key encrypts. */
export type SubmissionKeys = {
  current: { id: string; key: CryptoKey };
  byId: ReadonlyMap<string, CryptoKey>;
};

const ENV = "SUBMISSION_ENCRYPTION_KEYS";

/**
 * Reads `id:base64key,id:base64key,…`, each key 32 random bytes. The first
 * key encrypts new submissions; all of them decrypt, so after a rotation the
 * old key stays listed for the dead-letter queue's retention (blueprint §4.5).
 */
export async function parseEncryptionKeys(
  value: string,
): Promise<SubmissionKeys> {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) throw new Error(`${ENV} lists no key`);

  const byId = new Map<string, CryptoKey>();
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    const id = entry.slice(0, separator).trim();
    if (separator < 1 || id === "") {
      throw new Error(`${ENV}: every key needs an ID, as id:base64key`);
    }
    if (byId.has(id)) throw new Error(`${ENV} lists key ${id} twice`);

    const raw = fromBase64(entry.slice(separator + 1).trim());
    if (raw.length !== 32) {
      throw new Error(`${ENV}: key ${id} must be 32 bytes, base64-encoded`);
    }
    byId.set(
      id,
      await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]),
    );
  }

  const [currentId] = byId.keys();
  return {
    current: { id: currentId, key: byId.get(currentId) as CryptoKey },
    byId,
  };
}

export async function encryptSubmission(
  keys: SubmissionKeys,
  ids: SubmissionIds,
  payload: SubmissionPayload,
): Promise<EncryptedSubmission> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(ids) },
    keys.current.key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    v: 1,
    kid: keys.current.id,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
}

/** The payload, or an error for an unknown key or a tampered message. */
export async function decryptSubmission(
  keys: SubmissionKeys,
  ids: SubmissionIds,
  envelope: EncryptedSubmission,
): Promise<SubmissionPayload> {
  const key = keys.byId.get(envelope.kid);
  if (!key) throw new Error(`unknown submission key ${envelope.kid}`);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(envelope.iv),
      additionalData: associatedData(ids),
    },
    key,
    fromBase64(envelope.ct),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function associatedData({ submissionId, formId, version }: SubmissionIds) {
  return new TextEncoder().encode(
    JSON.stringify([submissionId, formId, version]),
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
