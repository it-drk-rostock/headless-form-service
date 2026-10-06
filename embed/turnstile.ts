// Cloudflare Turnstile in the embed (blueprint §4.2): forms with Turnstile
// on show its widget, and every attempt to send carries the widget's token.
// Cloudflare's script is loaded only for those forms, once per page.

/** The part of Cloudflare's `window.turnstile` the embed uses. */
export type TurnstileApi = {
  render: (container: HTMLElement, options: object) => string | undefined;
  getResponse: (widgetId: string) => string | undefined;
  reset: (widgetId: string) => void;
};

/** Why the visitor cannot send yet; each has its message. */
export type BotCheckWait = "turnstile_pending" | "turnstile_unavailable";

/** What the next attempt to send carries, or which message to show instead. */
export type BotCheckResult = { token: string | null } | { wait: BotCheckWait };

export type BotCheck = {
  /** `token: null` for forms without Turnstile. */
  next: () => BotCheckResult;
  /** Each token is good for one check: get a new one after a failed send. */
  reset: () => void;
};

// Loaded from Cloudflare, never bundled: Cloudflare requires it.
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Several copies of `embed.js` can run on one page; they share the script.
const SCRIPT_FLAG = "__headlessFormTurnstile";

/**
 * Renders the widget into `container` when the form has a site key. The
 * widget shows only when Cloudflare needs the visitor to do something.
 */
export function createBotCheck(
  container: HTMLElement,
  siteKey: string | null,
  loadApi: () => Promise<TurnstileApi> = loadTurnstileApi,
): BotCheck {
  if (siteKey === null) return { next: () => ({ token: null }), reset() {} };

  let widget: "loading" | "unavailable" | { api: TurnstileApi; id: string } =
    "loading";
  // Set while the widget reports an error (say, a hostname the site key does
  // not allow), so the visitor is not asked to wait forever.
  let failed = false;
  loadApi()
    .then((api) => {
      const id = api.render(container, {
        sitekey: siteKey,
        language: "de",
        appearance: "interaction-only",
        callback: () => {
          failed = false;
        },
        "error-callback": () => {
          failed = true;
        },
      });
      widget = id === undefined ? "unavailable" : { api, id };
    })
    .catch(() => {
      widget = "unavailable";
    });

  return {
    next: () => {
      if (widget === "loading") return { wait: "turnstile_pending" };
      if (widget === "unavailable" || failed) {
        return { wait: "turnstile_unavailable" };
      }
      const token = widget.api.getResponse(widget.id);
      return token ? { token } : { wait: "turnstile_pending" };
    },
    reset: () => {
      if (typeof widget === "object") {
        failed = false;
        widget.api.reset(widget.id);
      }
    },
  };
}

/** Cloudflare's API, loading its script the first time any form asks. */
function loadTurnstileApi(): Promise<TurnstileApi> {
  const page = window as unknown as Record<string, unknown>;
  if (!page[SCRIPT_FLAG]) {
    page[SCRIPT_FLAG] = new Promise<TurnstileApi>((resolve, reject) => {
      const loaded = () => page.turnstile as TurnstileApi | undefined;
      const existing = loaded();
      if (existing) {
        resolve(existing);
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.onload = () => {
        const api = loaded();
        if (api) resolve(api);
        else reject(new Error("Turnstile loaded without its API"));
      };
      // Blocked by the page's Content-Security-Policy, or offline.
      script.onerror = () => reject(new Error("Turnstile could not be loaded"));
      document.head.append(script);
    });
  }
  return page[SCRIPT_FLAG] as Promise<TurnstileApi>;
}
