// Mailjet's Send API v3.1, which carries notification emails (blueprint
// §4.4) and, later, failure alerts (ticket 30). Plain `fetch`, so it runs
// under Deno and under Vitest alike.

export type Mail = {
  from: { email: string; name: string };
  to: string[];
  subject: string;
  html: string;
  /** Shown in Mailjet's message log, to find a message again. */
  customId: string;
};

const SEND_URL = "https://api.mailjet.com/v3.1/send";

/**
 * A function that sends one message to all of `to`, and throws unless
 * Mailjet accepted it. Its errors name Mailjet's status and error codes only,
 * never addresses or content, so they can be logged.
 */
export function createMailjetSender({
  apiKey,
  secretKey,
  fetch = globalThis.fetch,
}: {
  apiKey: string;
  secretKey: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): (mail: Mail) => Promise<void> {
  const authorization = `Basic ${btoa(`${apiKey}:${secretKey}`)}`;

  return async (mail) => {
    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: mail.from.email, Name: mail.from.name },
            To: mail.to.map((email) => ({ Email: email })),
            Subject: mail.subject,
            HTMLPart: mail.html,
            CustomID: mail.customId,
          },
        ],
      }),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON, e.g. a gateway error page.
    }
    const messages = (body as { Messages?: unknown } | null)?.Messages;
    const accepted =
      response.ok &&
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((message) => message?.Status === "success");
    if (!accepted) {
      const codes = errorCodes(messages);
      throw new Error(
        `Mailjet answered ${response.status}${codes ? ` (${codes})` : ""}`,
      );
    }
  };
}

function errorCodes(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .flatMap((message) =>
      Array.isArray(message?.Errors) ? message.Errors : [],
    )
    .map((error) => error?.ErrorCode)
    .filter((code): code is string => typeof code === "string")
    .join(", ");
}
