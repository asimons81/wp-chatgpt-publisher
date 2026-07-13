import { describe, expect, it } from "vitest";
import { isPublicAddress, validateExternalUrl } from "../../apps/mcp-server/src/security/ssrf.js";

describe("SSRF address policy", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fc00::1"])(
    "blocks %s",
    (address) => expect(isPublicAddress(address)).toBe(false),
  );
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("allows public %s", (address) =>
    expect(isPublicAddress(address)).toBe(true),
  );
  it.each([
    ["http://example.com", "HTTPS is required"],
    ["https://user:secret@example.com", "embedded credentials"],
    ["https://example.com:8443", "port is not allowed"],
  ])("rejects unsafe URL form %s", async (url, message) => {
    await expect(validateExternalUrl(url, "site")).rejects.toThrow(message);
  });
});
