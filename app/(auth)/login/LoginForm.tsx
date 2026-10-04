"use client";

import { Button, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useActionState } from "react";
import { type FormState, signIn } from "@/lib/auth/actions.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../_components/FormError.tsx";

const initialState: FormState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction}>
      <Stack gap="sm">
        {state.error && <FormError>{t(state.error)}</FormError>}
        <input type="hidden" name="next" value={next} />
        <TextInput
          name="email"
          type="email"
          label={t("auth.email")}
          autoComplete="username"
          required
          autoFocus
        />
        <PasswordInput
          name="password"
          label={t("auth.password")}
          autoComplete="current-password"
          required
        />
        <Button type="submit" loading={pending} fullWidth mt="xs">
          {t("auth.loginSubmit")}
        </Button>
      </Stack>
    </form>
  );
}
