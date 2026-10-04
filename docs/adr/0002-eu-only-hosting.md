# EU-only hosting for every service that touches submissions

As a German welfare organisation under GDPR, every component that processes submissions or user accounts runs in an EU region: Supabase (EU region), Upstash Redis and QStash (EU region), Mailjet (EU provider). Choosing a provider or region outside the EU requires revisiting this decision.

The admin dashboard (Next.js via OpenNext on Cloudflare) is a deliberate exception: it never sees submissions, only form configuration and staff accounts. Cloudflare Turnstile likewise sees only bot-check signals, not answers. Forms must not collect special-category data (e.g. health data, Art. 9 GDPR); this service is not designed for it.
