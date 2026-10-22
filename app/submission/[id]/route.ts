import { branding } from "../../../lib/branding.ts";
import { isFormId } from "../../../lib/forms/id.ts";
import { locale, t } from "../../../lib/i18n/index.ts";
import { escapeHtml } from "../../../lib/shared/notification.ts";

/** Standalone document: the existing embed owns rendering and submission. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isFormId(id)) return new Response(null, { status: 404 });

  return new Response(
    `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(t("app.title"))} · ${escapeHtml(t("org.name"))}</title>
<link rel="icon" href="${escapeHtml(branding.favicon)}">
<style>
body { margin: 0; background: #f8f9fa; color: #212529; font-family: Arial, sans-serif; }
header { padding: 24px 16px; background: white; border-top: 4px solid #e60005; border-bottom: 1px solid #dee2e6; }
.brand { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.brand img { display: block; object-fit: contain; flex-shrink: 0; }
.brand h1 { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
.brand p { margin: 4px 0 0; color: #6c757d; font-size: 14px; line-height: 1.5; }
@media (max-width: 480px) {
  header { padding: 20px 16px; }
  .brand { gap: 12px; }
  .brand h1 { font-size: 16px; }
}
main { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
</style>
<script src="/embed.js" defer></script>
</head>
<body>
<header>
<div class="brand">
<img src="${escapeHtml(branding.shellIcon)}" width="44" height="44" alt="">
<div><h1>${escapeHtml(t("org.name"))}</h1><p>${escapeHtml(t("app.title"))}</p></div>
</div>
</header>
<main><div data-form="${id}"></div><noscript>${escapeHtml(t("forms.hostedNoScript"))}</noscript></main>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
