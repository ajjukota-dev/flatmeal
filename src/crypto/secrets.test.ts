import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, sha256Base64Url, timingSafeStringEqual } from "./secrets.js";

describe("secret helpers", () => {
  it("hashes PKCE values with SHA-256 base64url", () => {
    expect(sha256Base64Url("verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encrypts and decrypts secret values", () => {
    const encrypted = encryptSecret("fake-token", "encryption-secret");

    expect(encrypted).not.toContain("fake-token");
    expect(decryptSecret(encrypted, "encryption-secret")).toBe("fake-token");
  });

  it("compares strings without accepting unequal values", () => {
    expect(timingSafeStringEqual("same", "same")).toBe(true);
    expect(timingSafeStringEqual("same", "other")).toBe(false);
  });
});
