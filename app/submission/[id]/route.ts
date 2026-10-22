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
header { padding: 24px 16px; text-align: center; background: white; border-bottom: 1px solid #dee2e6; }
header img { object-fit: contain; max-width: 100%; }
header p { margin: 12px 0 0; }
main { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
</style>
<script src="/embed.js" defer></script>
</head>
<body>
<header><img src="${escapeHtml(branding.logo)}" width="${branding.logoWidth}" height="${branding.logoHeight}" alt="${escapeHtml(t("org.name"))}"><p>${escapeHtml(t("app.title"))}</p></header>
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
