// Entry point of `embed.js` (blueprint §6). Shows the current version of the
// form named by each `<div data-form="<form-uuid>">` on the page.
import "survey-core/i18n/german";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Model, surveyLocalization } from "survey-core";
import surveyCss from "survey-core/survey-core.min.css";
import { Survey } from "survey-react-ui";
import { loadForm } from "./load.ts";
import { messages, submitMessages } from "./messages.ts";
import { newSubmissionId, submitForm } from "./submit.ts";
import { type BotCheck, createBotCheck } from "./turnstile.ts";

// Set by the bundler from NEXT_PUBLIC_SUPABASE_URL.
declare const __LOAD_FORM_URL__: string;
declare const __SUBMIT_FORM_URL__: string;

/** How long a visitor waits for `/load-form` or `/submit-form`. */
const REQUEST_TIMEOUT_MS = 15_000;

const EMBED_CSS = `
.hfs-embed-message { margin: 0; padding: 1em; border: 1px solid #c8c8c8; border-radius: 4px; }
.hfs-embed-message[role="alert"] { border-color: #e30613; }
.hfs-embed-turnstile:not(:empty) { margin-top: 1em; }
`;

// Same as the dashboard's designer preview, so visitors see the texts the
// designer saw.
surveyLocalization.defaultLocale = "de";

// Editors paste the whole snippet once per form, so a page can run several
// copies of this script. These markers live on the page, not in the bundle,
// so each copy leaves alone what another one already set up.
const STYLES_FLAG = "__headlessFormEmbedStyles";
const MOUNTED_ATTRIBUTE = "data-form-mounted";

function start(): void {
  addStyles();
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-form]:not([${MOUNTED_ATTRIBUTE}])`,
  )) {
    element.setAttribute(MOUNTED_ATTRIBUTE, "");
    void mount(element);
  }
}

/**
 * Adds SurveyJS's theme once per page. A constructed stylesheet needs no
 * `style-src 'unsafe-inline'` in the page's Content-Security-Policy.
 */
function addStyles(): void {
  const flags = window as unknown as Record<string, boolean | undefined>;
  if (flags[STYLES_FLAG]) return;
  flags[STYLES_FLAG] = true;

  const css = surveyCss + EMBED_CSS;
  if (
    "adoptedStyleSheets" in document &&
    "replaceSync" in CSSStyleSheet.prototype
  ) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
  }
}

/** Loads and shows one form. Failures stay inside its own element. */
async function mount(element: HTMLElement): Promise<void> {
  showMessage(element, messages.loading, "status");

  const formId = element.dataset.form ?? "";
  const result = await loadForm(formId, {
    endpoint: __LOAD_FORM_URL__,
    fetch: (url) => fetch(url, { signal: timeout() }),
  });
  if (result.kind === "error") {
    showMessage(element, messages[result.reason], "alert");
    return;
  }

  try {
    const model = new Model(result.schema);
    // Answers to questions a visitor hid again are not sent.
    model.clearInvisibleValues = "onHidden";

    const surveyHost = document.createElement("div");
    const turnstileHost = document.createElement("div");
    turnstileHost.className = "hfs-embed-turnstile";
    const honeypot = createHoneypot();
    element.replaceChildren(surveyHost, turnstileHost, honeypot.wrapper);

    const botCheck = createBotCheck(turnstileHost, result.turnstileSiteKey);
    sendOnComplete(
      model,
      { formId, version: result.version },
      botCheck,
      honeypot,
    );
    model.onComplete.add(() => turnstileHost.remove());

    const root = createRoot(surveyHost, {
      // Unmounting from inside React's own callback is not allowed.
      onUncaughtError: () =>
        queueMicrotask(() => {
          root.unmount();
          showMessage(element, messages.failed, "alert");
        }),
    });
    root.render(createElement(Survey, { model }));
  } catch {
    showMessage(element, messages.failed, "alert");
  }
}

/**
 * Sends the answers when the visitor completes the form. The form stays open
 * until `/submit-form` accepts them, then shows its completion text; on an
 * error it shows a German message, and *Abschließen* tries again with the
 * same submission ID, so a retry is never a second submission. Every attempt
 * carries a fresh Turnstile token, when the form has Turnstile on.
 */
function sendOnComplete(
  model: Model,
  { formId, version }: { formId: string; version: number },
  botCheck: BotCheck,
  honeypot: Honeypot,
): void {
  const submissionId = newSubmissionId();
  let sending = false;
  let accepted = false;

  model.onCompleting.add((_, options) => {
    // The completion that follows acceptance, started below.
    if (accepted) return;
    options.allow = false;
    if (sending) return;

    const check = botCheck.next();
    if ("wait" in check) {
      model.notify(submitMessages[check.wait], "error");
      return;
    }

    sending = true;
    model.notify(submitMessages.sending, "info");
    void submitForm(
      {
        formId,
        version,
        submissionId,
        answers: model.data,
        turnstileToken: check.token,
        honeypot: honeypot.input.value,
      },
      {
        endpoint: __SUBMIT_FORM_URL__,
        fetch: (url, init) => fetch(url, { ...init, signal: timeout() }),
      },
    ).then((outcome) => {
      sending = false;
      if (outcome.kind === "accepted") {
        accepted = true;
        model.doComplete();
      } else {
        botCheck.reset();
        model.notify(submitMessages[outcome.reason], "error");
      }
    });
  });
}

/**
 * A text field people never see or reach, outside the SurveyJS answers. Bots
 * that fill every field fill it too, and `/submit-form` drops what they send.
 * Styled through the CSSOM, which a Content-Security-Policy allows.
 */
type Honeypot = { wrapper: HTMLElement; input: HTMLInputElement };

function createHoneypot(): Honeypot {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, {
    position: "absolute",
    left: "-10000px",
    width: "1px",
    height: "1px",
    overflow: "hidden",
  });
  const label = document.createElement("label");
  label.textContent = "Bitte leer lassen";
  const input = document.createElement("input");
  input.type = "text";
  // A name browsers don't autofill, so people never fill it by accident.
  input.name = "hfs_check";
  input.tabIndex = -1;
  input.autocomplete = "off";
  label.append(input);
  wrapper.append(label);
  return { wrapper, input };
}

/** Older browsers (Safari before 16) lack the timeout and just wait. */
function timeout(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

function showMessage(
  element: HTMLElement,
  text: string,
  role: "status" | "alert",
): void {
  const message = document.createElement("p");
  message.className = "hfs-embed-message";
  message.setAttribute("role", role);
  message.textContent = text;
  element.replaceChildren(message);
}

// With `defer` the page is parsed by now; without it, wait until it is, so
// every `data-form` element exists.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
