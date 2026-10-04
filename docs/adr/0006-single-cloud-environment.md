# One cloud environment, used for both development and production

There is a single set of cloud resources (one Supabase project, one Upstash Redis/QStash, one Mailjet account); no separate dev/staging environment. Only the Next.js dashboard runs locally during development. This keeps cost and operational overhead minimal for a small team, at the price that migrations, edge function deploys and test submissions hit the live system. Revisit this once real teams depend on the service (Supabase branching or a second project are the obvious upgrades).
