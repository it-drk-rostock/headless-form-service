import type { LoadFailure } from "./load.ts";
import type { SubmitFailure } from "./submit.ts";
import type { BotCheckWait } from "./turnstile.ts";

/**
 * The embed's fixed German texts (blueprint §1.2). Visitors read them on
 * TYPO3 pages, so they live here rather than in the dashboard's i18n keys.
 */
export const messages = {
  loading: "Formular wird geladen …",
  not_found: "Dieses Formular ist nicht verfügbar.",
  pass_invalid: "Dieser Link ist ungültig oder abgelaufen.",
  rate_limited:
    "Zu viele Versuche. Bitte warten Sie einen Moment und laden Sie die Seite dann neu.",
  failed:
    "Das Formular konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
} satisfies Record<LoadFailure | "loading", string>;

/** Shown inside the form while and after it is sent. */
export const submitMessages = {
  sending: "Ihre Angaben werden gesendet …",
  not_found:
    "Dieses Formular nimmt keine Einsendungen mehr an. Bitte laden Sie die Seite neu.",
  pass_invalid: messages.pass_invalid,
  rate_limited: "Zu viele Einsendungen. Bitte versuchen Sie es später erneut.",
  turnstile_invalid:
    "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
  answers_invalid:
    "Einige Angaben fehlen oder sind ungültig. Bitte prüfen Sie das Formular und versuchen Sie es erneut.",
  too_large:
    "Ihre Angaben sind zu umfangreich, um sie zu senden. Bitte kürzen Sie längere Antworten und versuchen Sie es erneut.",
  turnstile_pending:
    "Bitte warten Sie, bis die Sicherheitsprüfung unter dem Formular abgeschlossen ist, und versuchen Sie es dann erneut.",
  turnstile_unavailable:
    "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte laden Sie die Seite neu.",
  failed:
    "Ihre Angaben konnten nicht gesendet werden. Bitte versuchen Sie es in einem Moment erneut.",
} satisfies Record<SubmitFailure | BotCheckWait | "sending", string>;
