// Public Supabase settings, inlined into the dashboard at build time (see `.env.example`).

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function required(name: string, value: string | undefined): string {
  if (!value)
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return value;
}
