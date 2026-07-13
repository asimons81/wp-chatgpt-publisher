import { describe, expect, it } from "vitest";
import {
  SecretBox,
  constantTimeEqual,
  hashToken,
  redactSecrets,
} from "../../apps/mcp-server/src/security/crypto.js";

describe("secret storage", () => {
  const box = new SecretBox(Buffer.alloc(32, 3).toString("base64"));
  it("encrypts with context binding", () => {
    const encrypted = box.encrypt("credential", "connection-1");
    expect(encrypted).not.toContain("credential");
    expect(box.decrypt(encrypted, "connection-1")).toBe("credential");
    expect(() => box.decrypt(encrypted, "connection-2")).toThrow();
  });
  it("hashes and compares tokens", () => {
    expect(hashToken("a")).not.toBe("a");
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });
  it("redacts bearer values", () => {
    const output = redactSecrets(
      "Authorization: Bearer abc.def.ghi https://example.test/callback?code=oauth-code&grant=grant-secret&request=jwt-secret access_token=topsecret",
    );
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("topsecret");
    expect(output).not.toContain("oauth-code");
    expect(output).not.toContain("grant-secret");
    expect(output).not.toContain("jwt-secret");
  });
});
