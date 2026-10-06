import { describe, expect, it } from "vitest";
import { createBotCheck, type TurnstileApi } from "./turnstile.ts";

const SITE_KEY = "0x4AAAAAAAtestsitekey";
const container = {} as HTMLElement;

/** A Turnstile API that renders one widget and hands out `tokens` in turn. */
function fakeApi(tokens: (string | undefined)[] = ["token-1", "token-2"]) {
  const rendered: { container: HTMLElement; options: unknown }[] = [];
  let resets = 0;
  const api: TurnstileApi = {
    render: (into, options) => {
      rendered.push({ container: into, options });
      return "widget-1";
    },
    getResponse: () => tokens[resets],
    reset: () => {
      resets += 1;
    },
  };
  return { api, rendered, resets: () => resets };
}

/** Lets the API's loading promise settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createBotCheck", () => {
  it("has nothing to check for a form without Turnstile", () => {
    const check = createBotCheck(container, null, () => {
      throw new Error("must not load Turnstile");
    });

    expect(check.next()).toEqual({ token: null });
  });

  it("renders the widget in German with the form's site key", async () => {
    const { api, rendered } = fakeApi();
    createBotCheck(container, SITE_KEY, async () => api);
    await settled();

    expect(rendered).toEqual([
      {
        container,
        options: expect.objectContaining({ sitekey: SITE_KEY, language: "de" }),
      },
    ]);
  });

  it("asks the visitor to wait while Turnstile is loading", () => {
    const check = createBotCheck(
      container,
      SITE_KEY,
      () => new Promise(() => {}),
    );

    expect(check.next()).toEqual({ wait: "turnstile_pending" });
  });

  it("asks the visitor to wait while the widget has no token yet", async () => {
    const { api } = fakeApi([undefined]);
    const check = createBotCheck(container, SITE_KEY, async () => api);
    await settled();

    expect(check.next()).toEqual({ wait: "turnstile_pending" });
  });

  it("hands out the widget's token, and a new one after a reset", async () => {
    const { api, resets } = fakeApi();
    const check = createBotCheck(container, SITE_KEY, async () => api);
    await settled();

    expect(check.next()).toEqual({ token: "token-1" });
    check.reset();
    expect(resets()).toBe(1);
    expect(check.next()).toEqual({ token: "token-2" });
  });

  it("says so when Turnstile cannot be loaded", async () => {
    const check = createBotCheck(container, SITE_KEY, async () => {
      throw new Error("blocked by the page's Content-Security-Policy");
    });
    await settled();

    expect(check.next()).toEqual({ wait: "turnstile_unavailable" });
    expect(() => check.reset()).not.toThrow();
  });

  it("says so when the widget reports an error, until it is reset", async () => {
    const { api, rendered } = fakeApi([undefined]);
    const check = createBotCheck(container, SITE_KEY, async () => api);
    await settled();
    const options = rendered[0].options as Record<string, () => void>;

    options["error-callback"]();
    expect(check.next()).toEqual({ wait: "turnstile_unavailable" });
    check.reset();
    expect(check.next()).toEqual({ wait: "turnstile_pending" });
  });

  it("says so when the widget cannot be rendered", async () => {
    const { api } = fakeApi();
    api.render = () => {
      throw new Error("invalid site key");
    };
    const check = createBotCheck(container, SITE_KEY, async () => api);
    await settled();

    expect(check.next()).toEqual({ wait: "turnstile_unavailable" });
  });
});
