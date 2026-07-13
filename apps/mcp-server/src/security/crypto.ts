import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = 1;
export class SecretBox {
  readonly #key: Buffer;
  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64");
    if (this.#key.length !== 32) throw new Error("Encryption key must decode to exactly 32 bytes");
  }
  encrypt(plaintext: string, context: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION.toString(),
      nonce.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
  decrypt(envelope: string, context: string): string {
    const [version, nonceValue, tagValue, ciphertextValue] = envelope.split(".");
    if (version !== VERSION.toString() || !nonceValue || !tagValue || !ciphertextValue)
      throw new Error("Invalid encrypted value");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(nonceValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(?:access|refresh|authorization|credential|password|secret)[_-]?token?\s*[=:]\s*[^\s,;]+/gi,
      "secret=[REDACTED]",
    );
}
