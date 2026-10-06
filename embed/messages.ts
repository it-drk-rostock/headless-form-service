import type { LoadFailure } from "./load.ts";

/**
 * The embed's fixed German texts (blueprint §1.2). Visitors read them on
 * TYPO3 pages, so they live here rather than in the dashboard's i18n keys.
 */
export const messages = {
  loading: "Formular wird geladen …",
  not_found: "Dieses Formular ist nicht verfügbar.",
  pass_invalid: "Dieser Link ist ungültig oder abgelaufen.",
  failed:
    "Das Formular konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
  // Until submissions are sent (ticket 12), so nobody believes theirs was.
  submitUnavailable:
    "Das Formular kann noch nicht abgeschickt werden. Bitte versuchen Sie es später erneut.",
} satisfies Record<LoadFailure | "loading" | "submitUnavailable", string>;
