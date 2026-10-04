import type { MessageKey } from "../i18n/index.ts";

/** Must match `minimum_password_length` in `supabase/config.toml`. */
export const MIN_PASSWORD_LENGTH = 10;

/** Checks a new password before it goes to Supabase Auth, which enforces the same minimum. */
export function newPasswordProblem(
  password: string,
  confirmation: string,
): MessageKey | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return "auth.errorPasswordTooShort";
  if (password !== confirmation) return "auth.errorPasswordMismatch";
  return null;
}
