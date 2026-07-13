import { describe, expect, it } from "vitest";
import {
  CreateDraftInputSchema,
  SCOPE_PROFILES,
  UploadMediaInputSchema,
  assertScopes,
  hasAllScopes,
} from "@wp-chatgpt-publisher/contracts";

describe("scope policy", () => {
  it("keeps consequential scopes out of the editorial profile", () => {
    expect(SCOPE_PROFILES.editorial).not.toContain("publish:execute");
    expect(SCOPE_PROFILES.editorial).not.toContain("publish:schedule");
    expect(SCOPE_PROFILES.editorial).not.toContain("published:edit");
  });
  it("requires every scope", () => {
    expect(hasAllScopes(["site:read", "content:read"], ["site:read"])).toBe(true);
    expect(() => assertScopes(["site:read"], ["publish:execute"])).toThrow(/publish:execute/);
  });
});
describe("write schemas", () => {
  it("requires draft idempotency", () => {
    expect(CreateDraftInputSchema.safeParse({ title: "Test", content: "Body" }).success).toBe(
      false,
    );
  });
  it("requires exactly one media source", () => {
    const common = { fileName: "image.png", idempotencyKey: crypto.randomUUID() };
    expect(UploadMediaInputSchema.safeParse(common).success).toBe(false);
    expect(
      UploadMediaInputSchema.safeParse({ ...common, sourceUrl: "https://example.com/image.png" })
        .success,
    ).toBe(true);
    expect(
      UploadMediaInputSchema.safeParse({
        ...common,
        sourceUrl: "https://example.com/image.png",
        file: {
          download_url: "https://chatgpt.example/files/file_1",
          file_id: "file_1",
          file_name: "image.png",
        },
      }).success,
    ).toBe(false);
    expect(
      UploadMediaInputSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        file: {
          download_url: "https://chatgpt.example/files/file_1",
          file_id: "file_1",
          file_name: "image.png",
        },
      }).success,
    ).toBe(true);
  });
});
