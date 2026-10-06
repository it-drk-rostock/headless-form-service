// Entry point of `embed.js` (blueprint §6). Shows the current version of the
// form named by each `<div data-form="<form-uuid>">` on the page.
import "survey-core/i18n/german";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Model, surveyLocalization } from "survey-core";
import surveyCss from "survey-core/survey-core.min.css";
import { Survey } from "survey-react-ui";
import { loadForm } from "./load.ts";
import { messages } from "./messages.ts";

// Set by the bundler from NEXT_PUBLIC_SUPABASE_URL.
declare const __LOAD_FORM_URL__: string;

/** How long a visitor waits for `/load-form` before the error shows. */
const LOAD_TIMEOUT_MS = 15_000;

const EMBED_CSS = `
.hfs-embed-message { margin: 0; padding: 1em; border: 1px solid #c8c8c8; border-radius: 4px; }
.hfs-embed-message[role="alert"] { border-color: #e30613; }
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

  const result = await loadForm(element.dataset.form ?? "", {
    endpoint: __LOAD_FORM_URL__,
    // Older browsers (Safari before 16) lack the timeout and just wait.
    fetch: (url) =>
      fetch(url, {
        signal:
          typeof AbortSignal.timeout === "function"
            ? AbortSignal.timeout(LOAD_TIMEOUT_MS)
            : undefined,
      }),
  });
  if (result.kind === "error") {
    showMessage(element, messages[result.reason], "alert");
    return;
  }

  try {
    const model = new Model(result.schema);
    model.onCompleting.add((_, options) => {
      options.allow = false;
      model.notify(messages.submitUnavailable, "error");
    });

    element.replaceChildren();
    const root = createRoot(element, {
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
