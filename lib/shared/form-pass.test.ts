import { describe, expect, it } from "vitest";
import {
  formPassUrl,
  generateFormPassSecret,
  hashFormPassSecret,
  passMetadataProblem,
} from "./form-pass.ts";

describe("generateFormPassSecret", () => {
  it("makes a URL-safe secret of 256 random bits", () => {
    const secret = generateFormPassSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateFormPassSecret()).not.toBe(secret);
  });
});

describe("hashFormPassSecret", () => {
  it("is the lower-case hex SHA-256 of the secret", async () => {
    expect(await hashFormPassSecret("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("formPassUrl", () => {
  it("adds the secret to the form page", () => {
    expect(formPassUrl("https://www.drk-rostock.de/kurs", "s3cr-t_")).toBe(
      "https://www.drk-rostock.de/kurs?form_pass=s3cr-t_",
    );
  });

  it("keeps the page's own query and anchor", () => {
    expect(
      formPassUrl("https://www.drk-rostock.de/index.php?id=12#formular", "abc"),
    ).toBe("https://www.drk-rostock.de/index.php?id=12&form_pass=abc#formular");
  });

  it("replaces a pass already in the page address", () => {
    expect(
      formPassUrl("https://www.drk-rostock.de/kurs?form_pass=old", "new"),
    ).toBe("https://www.drk-rostock.de/kurs?form_pass=new");
  });
});

describe("passMetadataProblem", () => {
  it("accepts flat string and number values", () => {
    expect(passMetadataProblem({})).toBeNull();
    expect(
      passMetadataProblem({ ticket: "T-17", kampagne_id: 4, "a-b": 1.5 }),
    ).toBeNull();
  });

  it("refuses anything but an object", () => {
    for (const value of [null, [], "x", 1]) {
      expect(passMetadataProblem(value)).toBe("not_object");
    }
  });

  it("refuses nested, boolean and empty values", () => {
    for (const value of [{ a: 1 }, [1], true, null]) {
      expect(passMetadataProblem({ key: value })).toBe("value_invalid");
    }
  });

  it("refuses numbers JSON cannot hold", () => {
    expect(passMetadataProblem({ key: Number.NaN })).toBe("value_invalid");
    expect(passMetadataProblem({ key: Number.POSITIVE_INFINITY })).toBe(
      "value_invalid",
    );
  });

  it("refuses values longer than 500 characters", () => {
    expect(passMetadataProblem({ key: "x".repeat(500) })).toBeNull();
    expect(passMetadataProblem({ key: "x".repeat(501) })).toBe(
      "value_too_long",
    );
  });

  it("refuses keys a placeholder cannot name", () => {
    for (const key of [
      "",
      "mit leerzeichen",
      "pass.ticket",
      "ä",
      "k".repeat(51),
    ]) {
      expect(passMetadataProblem({ [key]: "x" })).toBe("key_invalid");
    }
  });

  it("refuses more than 20 entries", () => {
    const entries = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    expect(passMetadataProblem(entries(20))).toBeNull();
    expect(passMetadataProblem(entries(21))).toBe("too_many");
  });
});
