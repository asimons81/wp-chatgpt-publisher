import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveConnectorFile,
  type ResolvedConnectorUpload,
} from "../../apps/mcp-server/src/media/connector-files.js";
import { stableHash, uploadForm } from "../../apps/mcp-server/src/wordpress/payload.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function mounted(name = "example.png", bytes = PNG) {
  const root = await mkdtemp(path.join(tmpdir(), "wpcp-mnt-data-"));
  roots.push(root);
  const filePath = path.join(root, name);
  // Test-only path created under the isolated temporary directory above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(filePath, bytes);
  return { root, filePath };
}

describe("connector file resolution", () => {
  it("uploads a PNG from the configured /mnt/data-style mount", async () => {
    const { root, filePath } = await mounted();
    const result = await resolveConnectorFile(
      {
        download_url: filePath,
        file_id: "file_generated_image",
        mime_type: "image/png",
        file_name: "example.png",
      },
      { approvedRoots: [root], maximumBytes: 1024 * 1024 },
    );
    expect(result.bytes).toEqual(new Uint8Array(PNG));
    expect(result.mimeType).toBe("image/png");
    expect(result.fileName).toBe("example.png");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves a temporary HTTPS connector file reference", async () => {
    const result = await resolveConnectorFile(
      {
        download_url: "https://files.openai.example/file_123",
        file_id: "file_123",
        mime_type: "image/png",
        file_name: "connector.png",
      },
      {
        approvedRoots: ["/mnt/data"],
        maximumBytes: 1024,
        downloadRemote: (url) => {
          expect(url).toBe("https://files.openai.example/file_123");
          return Promise.resolve(new Uint8Array(PNG));
        },
      },
    );
    expect(result.fileName).toBe("connector.png");
  });

  it("rejects an arbitrary local path", async () => {
    const { root } = await mounted();
    await expect(
      resolveConnectorFile(
        { download_url: "/etc/passwd", file_id: "file_bad", file_name: "passwd.png" },
        { approvedRoots: [root], maximumBytes: 1024 },
      ),
    ).rejects.toThrow(/outside an approved mounted upload directory/i);
  });

  it("reports a missing mounted file", async () => {
    const { root } = await mounted();
    await expect(
      resolveConnectorFile(
        {
          download_url: path.join(root, "missing.png"),
          file_id: "file_missing",
          file_name: "missing.png",
        },
        { approvedRoots: [root], maximumBytes: 1024 },
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("reports an unresolved connector file reference", async () => {
    await expect(
      resolveConnectorFile(
        {
          download_url: "connector:file_123",
          file_id: "file_123",
          file_name: "unresolved.png",
        },
        { approvedRoots: ["/mnt/data"], maximumBytes: 1024 },
      ),
    ).rejects.toThrow(/could not be resolved/i);
  });

  it("rejects executable content and oversized images", async () => {
    const executable = await mounted("payload.png", Buffer.from("MZ executable"));
    await expect(
      resolveConnectorFile(
        {
          download_url: executable.filePath,
          file_id: "file_executable",
          file_name: "payload.png",
        },
        { approvedRoots: [executable.root], maximumBytes: 1024 },
      ),
    ).rejects.toThrow(/not a supported/i);

    const image = await mounted("large.png");
    await expect(
      resolveConnectorFile(
        { download_url: image.filePath, file_id: "file_large", file_name: "large.png" },
        { approvedRoots: [image.root], maximumBytes: 8 },
      ),
    ).rejects.toThrow(/upload limit/i);
  });
});

describe("WordPress multipart normalization", () => {
  it("builds a binary media form with digest and idempotency fields", () => {
    const file: ResolvedConnectorUpload = {
      bytes: new Uint8Array(PNG),
      fileName: "example.png",
      mimeType: "image/png",
      sha256: "a".repeat(64),
    };
    const form = uploadForm(file, { idempotencyKey: crypto.randomUUID(), altText: "Example" });
    const uploaded = form.get("file");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("example.png");
    expect((uploaded as File).type).toBe("image/png");
    expect(form.get("fileSha256")).toBe("a".repeat(64));
    expect(form.get("altText")).toBe("Example");
  });

  it("includes nested connector fields in the idempotency hash", () => {
    const first = stableHash({ file: { file_id: "file_1", download_url: "/mnt/data/one.png" } });
    const reordered = stableHash({
      file: { download_url: "/mnt/data/one.png", file_id: "file_1" },
    });
    const second = stableHash({ file: { file_id: "file_2", download_url: "/mnt/data/two.png" } });
    expect(first).toBe(reordered);
    expect(first).not.toBe(second);
  });
});
