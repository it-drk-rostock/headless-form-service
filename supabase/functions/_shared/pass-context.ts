import {
  type PassContext,
  parsePassContext,
} from "../../../lib/shared/pass-context.ts";
import {
  type EncryptedSubmission,
  fromBase64,
  type SubmissionKeys,
  toBase64,
} from "./submission-crypto.ts";

function binding(formId: string, tokenHash: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify(["form-pass-context-v1", formId.toLowerCase(), tokenHash]),
  );
}

export async function encryptPassContext(
  keys: SubmissionKeys,
  formId: string,
  tokenHash: string,
  context: PassContext,
): Promise<EncryptedSubmission> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: binding(formId, tokenHash) },
    keys.current.key,
    new TextEncoder().encode(JSON.stringify(context)),
  );
  return {
    v: 1,
    kid: keys.current.id,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptPassContext(
  keys: SubmissionKeys,
  formId: string,
  tokenHash: string,
  envelope: EncryptedSubmission,
): Promise<PassContext> {
  const key = keys.byId.get(envelope.kid);
  if (!key) throw new Error("Unknown pass context encryption key");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(envelope.iv),
      additionalData: binding(formId, tokenHash),
    },
    key,
    fromBase64(envelope.ct),
  );
  const context = parsePassContext(
    JSON.parse(new TextDecoder().decode(plaintext)),
  );
  if (!context) throw new Error("Invalid encrypted pass context");
  return context;
}
