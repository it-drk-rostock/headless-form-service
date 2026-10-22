import { describe, expect, it } from "vitest";
import { authRedirect, safeNextPath } from "./routing.ts";

describe("authRedirect", () => {
  it("allows hosted forms without login, including form-pass links", () => {
    expect(
      authRedirect({
        path: "/submission/123?form_pass=secret",
        signedIn: false,
      }),
    ).toBeNull();
    expect(authRedirect({ path: "/submissionx/123", signedIn: false })).toBe(
      "/login?next=%2Fsubmissionx%2F123",
    );
  });
  it("sends signed-out visitors of a dashboard page to the login page, remembering where they wanted to go", () => {
    expect(authRedirect({ path: "/forms", signedIn: false })).toBe(
      "/login?next=%2Fforms",
    );
    expect(authRedirect({ path: "/teams/42?tab=x", signedIn: false })).toBe(
      "/login?next=%2Fteams%2F42%3Ftab%3Dx",
    );
  });

  it("does not remember the root path", () => {
    expect(authRedirect({ path: "/", signedIn: false })).toBe("/login");
  });

  it("lets signed-out visitors reach the login page and the email link handler", () => {
    expect(authRedirect({ path: "/login", signedIn: false })).toBeNull();
    expect(
      authRedirect({
        path: "/auth/confirm?token_hash=abc&type=invite",
        signedIn: false,
      }),
    ).toBeNull();
  });

  it("requires a session to set a password", () => {
    expect(authRedirect({ path: "/set-password", signedIn: false })).toBe(
      "/login?next=%2Fset-password",
    );
  });

  it("does not treat paths that only share a prefix as public", () => {
    expect(authRedirect({ path: "/loginx", signedIn: false })).toBe(
      "/login?next=%2Floginx",
    );
    expect(authRedirect({ path: "/authx", signedIn: false })).toBe(
      "/login?next=%2Fauthx",
    );
  });

  it("lets signed-in people through", () => {
    expect(authRedirect({ path: "/forms", signedIn: true })).toBeNull();
    expect(authRedirect({ path: "/set-password", signedIn: true })).toBeNull();
  });

  it("sends signed-in people away from the login page", () => {
    expect(authRedirect({ path: "/login", signedIn: true })).toBe("/forms");
    expect(authRedirect({ path: "/login?next=%2Fteams", signedIn: true })).toBe(
      "/teams",
    );
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/teams/42?tab=x")).toBe("/teams/42?tab=x");
  });

  it("falls back to the forms list for anything that could leave the site", () => {
    for (const next of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "forms",
      "/login",
      "/login?next=%2Fforms",
      // URL parsers drop tabs and newlines, which turns these into `//evil.example`.
      "/\t/evil.example",
      "/\n/evil.example",
      "/\\/evil.example",
    ]) {
      expect(safeNextPath(next)).toBe("/forms");
    }
  });
});
