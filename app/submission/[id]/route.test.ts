import { describe, expect, it } from "vitest";
import { GET } from "./route.ts";

const id = "12345678-1234-1234-1234-123456789abc";

describe("hosted form page", () => {
  it("loads the embed without reflecting a form pass in the document", async () => {
    const response = await GET(
      new Request(`https://forms.example/submission/${id}?form_pass=secret`),
      { params: Promise.resolve({ id }) },
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`data-form="${id}"`);
    expect(html).toContain('<script src="/embed.js" defer></script>');
    expect(html).toContain("DRK Kreisverband Rostock e.V.");
    expect(html).not.toContain("secret");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("refuses malformed IDs before generating HTML", async () => {
    const response = await GET(
      new Request("https://forms.example/submission/x"),
      {
        params: Promise.resolve({ id: '"><script>alert(1)</script>' }),
      },
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
