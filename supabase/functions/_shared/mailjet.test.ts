import { describe, expect, it } from "vitest";
import { createMailjetSender } from "./mailjet.ts";

const MAIL = {
  from: { email: "formulare@drk-rostock.de", name: "DRK Rostock" },
  to: ["kurse@drk-rostock.de", "leitung@drk-rostock.de"],
  subject: "Neue Einsendung: Kursanmeldung",
  html: "<p>Erika</p>",
  customId: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
};

function fakeFetch(status: number, body: unknown) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, requests };
}

describe("createMailjetSender", () => {
  it("sends one message to all recipients through the Send API v3.1", async () => {
    const { fetch, requests } = fakeFetch(200, {
      Messages: [{ Status: "success" }],
    });
    const send = createMailjetSender({
      apiKey: "key",
      secretKey: "secret",
      fetch,
    });

    await send(MAIL);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.mailjet.com/v3.1/send");
    expect(request.headers.get("authorization")).toBe(
      `Basic ${btoa("key:secret")}`,
    );
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(await request.json()).toEqual({
      Messages: [
        {
          From: { Email: "formulare@drk-rostock.de", Name: "DRK Rostock" },
          To: [
            { Email: "kurse@drk-rostock.de" },
            { Email: "leitung@drk-rostock.de" },
          ],
          Subject: "Neue Einsendung: Kursanmeldung",
          HTMLPart: "<p>Erika</p>",
          CustomID: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
        },
      ],
    });
  });

  it("throws with Mailjet's error codes, not its messages, when it refuses", async () => {
    const { fetch } = fakeFetch(400, {
      Messages: [
        {
          Status: "error",
          Errors: [
            {
              ErrorCode: "mj-0013",
              StatusCode: 400,
              ErrorMessage: '"kurse@drk-rostock" is an invalid email address.',
            },
          ],
        },
      ],
    });
    const send = createMailjetSender({ apiKey: "k", secretKey: "s", fetch });

    const failure = send(MAIL);

    await expect(failure).rejects.toThrow("Mailjet answered 400 (mj-0013)");
    await expect(failure).rejects.not.toThrow("kurse");
  });

  it("throws when a message was not accepted, even with 200", async () => {
    const { fetch } = fakeFetch(200, { Messages: [{ Status: "error" }] });
    const send = createMailjetSender({ apiKey: "k", secretKey: "s", fetch });

    await expect(send(MAIL)).rejects.toThrow("Mailjet answered 200");
  });

  it("throws on an answer that is not JSON", async () => {
    const fetch = async () => new Response("Bad Gateway", { status: 502 });
    const send = createMailjetSender({ apiKey: "k", secretKey: "s", fetch });

    await expect(send(MAIL)).rejects.toThrow("Mailjet answered 502");
  });
});
