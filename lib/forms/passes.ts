import type { MessageKey } from "../i18n/index.ts";
import {
  type PassMetadata,
  type PassMetadataProblem,
  passMetadataProblem,
} from "../shared/form-pass.ts";
import { isObject } from "../shared/object.ts";
import { type ProfileNameRow, profileName } from "../shared/profile.ts";

/** Same limit as the `forms_page_url_check` constraint in the database. */
export const FORM_PAGE_MAX_LENGTH = 2000;
/** The highest use limit the dashboard offers; none means unlimited. */
export const PASS_MAX_USES_LIMIT = 10_000;
/** The longest expiry the dashboard offers, one year; none means no expiry. */
export const PASS_EXPIRY_MAX_HOURS = 8760;
/** What the dashboard suggests, like `/generate-form-pass` (blueprint §7). */
export const PASS_DEFAULT_MAX_USES = 1;
export const PASS_DEFAULT_EXPIRY_HOURS = 48;

/**
 * The form page as typed: none when blank, otherwise an http or https
 * address as browsers write it, without credentials.
 */
export function parseFormPage(
  input: string,
): { pageUrl: string | null } | { error: MessageKey } {
  const trimmed = input.trim();
  if (trimmed === "") return { pageUrl: null };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "forms.errorPageInvalid" };
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.href.length > FORM_PAGE_MAX_LENGTH
  ) {
    return { error: "forms.errorPageInvalid" };
  }
  return { pageUrl: url.href };
}

/** A pass metadata row as typed in the dashboard. */
export type PassMetadataEntry = { key: string; value: string };

/** What the dashboard sends to create a form pass; null for unlimited / no expiry. */
export type FormPassInput = {
  maxUses: number | null;
  expiresInHours: number | null;
  metadata: PassMetadataEntry[];
};

export type ParsedFormPassInput =
  | {
      maxUses: number | null;
      expiresInHours: number | null;
      metadata: PassMetadata;
    }
  | { error: MessageKey };

const metadataErrors: Record<PassMetadataProblem, MessageKey> = {
  not_object: "forms.errorGeneric",
  too_many: "forms.errorPassMetadataTooMany",
  key_invalid: "forms.errorPassMetadataKey",
  value_invalid: "forms.errorGeneric",
  value_too_long: "forms.errorPassMetadataValueTooLong",
};

/**
 * A new pass's use limit, expiry and metadata, checked. Metadata rows are
 * trimmed, and rows left entirely blank are dropped; values stay text.
 */
export function parseFormPassInput(input: unknown): ParsedFormPassInput {
  if (!isObject(input) || !Array.isArray(input.metadata)) {
    return { error: "forms.errorGeneric" };
  }
  const { maxUses, expiresInHours } = input;
  if (maxUses !== null && !isCountUpTo(maxUses, PASS_MAX_USES_LIMIT)) {
    return { error: "forms.errorPassMaxUses" };
  }
  if (
    expiresInHours !== null &&
    !isCountUpTo(expiresInHours, PASS_EXPIRY_MAX_HOURS)
  ) {
    return { error: "forms.errorPassExpiry" };
  }

  const metadata: PassMetadata = {};
  for (const entry of input.metadata) {
    if (!isObject(entry)) return { error: "forms.errorGeneric" };
    const key = String(entry.key ?? "").trim();
    const value = String(entry.value ?? "").trim();
    if (key === "" && value === "") continue;
    if (Object.hasOwn(metadata, key)) {
      return { error: "forms.errorPassMetadataDuplicate" };
    }
    metadata[key] = value;
  }
  const problem = passMetadataProblem(metadata);
  if (problem) return { error: metadataErrors[problem] };
  return { maxUses, expiresInHours, metadata };
}

function isCountUpTo(value: unknown, max: number): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= max
  );
}

/** How a pass shows in the list (blueprint §3: valid, used up, expired, revoked). */
export type FormPassStatus = "valid" | "used_up" | "expired" | "revoked";

/**
 * Whether the pass is valid at `now`, or why not. Revoked wins over used up,
 * and used up over expired.
 */
export function formPassStatus(
  pass: Pick<FormPass, "revokedAt" | "expiresAt" | "maxUses" | "useCount">,
  now: Date,
): FormPassStatus {
  if (pass.revokedAt !== null) return "revoked";
  if (pass.maxUses !== null && pass.useCount >= pass.maxUses) return "used_up";
  if (pass.expiresAt !== null && new Date(pass.expiresAt) <= now) {
    return "expired";
  }
  return "valid";
}

/** Where a form pass was created, as the `form_pass_source` enum has it. */
export type FormPassSource = "dashboard" | "n8n";

/** A form pass as the dashboard lists it, without its secret or hash. */
export type FormPass = {
  id: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  source: FormPassSource;
  metadata: PassMetadata;
  createdAt: string;
  /** Null for n8n, or when the account is gone or not visible. */
  createdBy: string | null;
  status: FormPassStatus;
};

/** The columns behind a `FormPass`; the creator's profile through its foreign key. */
export const FORM_PASS_COLUMNS =
  "id, max_uses, use_count, expires_at, revoked_at, source, metadata, created_at, creator:profiles!form_passes_created_by_fkey(full_name, email)";

export type FormPassRow = {
  id: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  source: FormPassSource;
  metadata: PassMetadata;
  created_at: string;
  creator: ProfileNameRow | null;
};

export function toFormPass(row: FormPassRow, now: Date): FormPass {
  const pass = {
    id: row.id,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    source: row.source,
    metadata: row.metadata,
    createdAt: row.created_at,
    createdBy: profileName(row.creator),
  };
  return { ...pass, status: formPassStatus(pass, now) };
}
