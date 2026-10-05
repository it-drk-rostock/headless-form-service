import type { MessageKey } from "../i18n/index.ts";
import { isEmailAddress } from "../shared/email.ts";

/** Why `email` (already normalised) cannot be invited, or null if it can. */
export function emailProblem(email: string): MessageKey | null {
  if (!email) return "members.errorEmailMissing";
  if (!isEmailAddress(email)) return "members.errorEmailInvalid";
  return null;
}
