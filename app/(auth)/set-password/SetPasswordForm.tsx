"use client";

import { Button, PasswordInput, Stack } from "@mantine/core";
import { useActionState } from "react";
import { type FormState, setPassword } from "@/lib/auth/actions.ts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../_components/FormError.tsx";

const initialState: FormState = { error: null };

export function SetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(
    setPassword,
    initialState,
  );

  return (
    <form action={formAction}>
      <Stack gap="sm">
        {state.error && (
          <FormError>{t(state.error, { min: MIN_PASSWORD_LENGTH })}</FormError>
        )}
        {/* Lets password managers store the new password under the right account. */}
        <input
          type="hidden"
          name="username"
          autoComplete="username"
          value={email}
        />
        <PasswordInput
          name="password"
          label={t("auth.newPassword")}
          description={t("auth.newPasswordHint", { min: MIN_PASSWORD_LENGTH })}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoFocus
        />
        <PasswordInput
          name="confirmation"
          label={t("auth.confirmPassword")}
          autoComplete="new-password"
          required
        />
        <Button type="submit" loading={pending} fullWidth mt="xs">
          {t("auth.setPasswordSubmit")}
        </Button>
      </Stack>
    </form>
  );
}
