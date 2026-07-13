import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "../../apps/mcp-server/src/errors.js";

describe("safe application errors", () => {
  it("serializes only the stable public contract", () => {
    const error = new AppError(
      "edit_conflict",
      "The post changed.",
      409,
      "Fetch the latest version.",
      false,
      "7e794560-8eb7-48a5-8489-686d77dd1b27",
    );
    expect(error.toSafeObject()).toEqual({
      code: "edit_conflict",
      message: "The post changed.",
      remediation: "Fetch the latest version.",
      requestId: "7e794560-8eb7-48a5-8489-686d77dd1b27",
      retryable: false,
    });
    expect(toAppError(error)).toBe(error);
  });

  it("maps unknown failures without exposing their details", () => {
    const mapped = toAppError(new Error("database password secret"));
    expect(mapped.code).toBe("upstream_error");
    expect(mapped.status).toBe(502);
    expect(mapped.retryable).toBe(true);
    expect(JSON.stringify(mapped.toSafeObject())).not.toContain("database password secret");
  });

  it("maps malformed JSON to a safe client validation error", () => {
    const parserError = Object.assign(new SyntaxError("secret parser detail"), {
      status: 400,
      type: "entity.parse.failed",
    });
    const mapped = toAppError(parserError);

    expect(mapped.code).toBe("validation_error");
    expect(mapped.status).toBe(400);
    expect(mapped.retryable).toBe(false);
    expect(JSON.stringify(mapped.toSafeObject())).not.toContain("secret parser detail");
  });
});
