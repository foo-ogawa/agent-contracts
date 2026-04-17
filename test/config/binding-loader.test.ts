import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBindings } from "../../src/config/binding-loader.js";
import { ConfigLoadError } from "../../src/config/loader.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "binding-loader-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadBindings", () => {
  it("loads a valid binding YAML file", async () => {
    const filePath = join(tempDir, "binding.yaml");
    await writeFile(
      filePath,
      `software: cursor\nversion: 1\nguardrail_impl:\n  gr:\n    checks:\n      - message: ok\n`,
    );
    const results = await loadBindings([filePath]);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe(filePath);
    expect(results[0].binding.software).toBe("cursor");
    expect(results[0].binding.version).toBe(1);
  });

  it("loads multiple binding files", async () => {
    const a = join(tempDir, "a.yaml");
    const b = join(tempDir, "b.yaml");
    await writeFile(
      a,
      `software: cursor\nversion: 1\nguardrail_impl:\n  g:\n    checks: []\n`,
    );
    await writeFile(
      b,
      `software: vscode\nversion: 1\nguardrail_impl:\n  g:\n    checks: []\n`,
    );
    const results = await loadBindings([a, b]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.binding.software)).toEqual(["cursor", "vscode"]);
  });

  it("throws ConfigLoadError for non-existent file", async () => {
    const missing = join(tempDir, "missing.yaml");
    await expect(loadBindings([missing])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError && err.filePath === missing,
    );
  });

  it("throws ConfigLoadError for invalid YAML syntax", async () => {
    const filePath = join(tempDir, "bad.yaml");
    await writeFile(filePath, ":\n  :\n   {{{{\n");
    await expect(loadBindings([filePath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Invalid YAML syntax") &&
        err.filePath === filePath,
    );
  });

  it("throws ConfigLoadError for invalid schema", async () => {
    const filePath = join(tempDir, "invalid.yaml");
    await writeFile(filePath, "version: 1\n");
    await expect(loadBindings([filePath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Invalid binding schema") &&
        err.filePath === filePath,
    );
  });

  it("returns empty array for empty input array", async () => {
    await expect(loadBindings([])).resolves.toEqual([]);
  });

  it("parses binding with expected software and version fields", async () => {
    const filePath = join(tempDir, "x.yaml");
    await writeFile(
      filePath,
      `software: my-ide\nversion: 1\nreporting:\n  commands: {}\n  fail_open: true\n  timeout_ms: 3000\n`,
    );
    const [row] = await loadBindings([filePath]);
    expect(row.binding.software).toBe("my-ide");
    expect(row.binding.version).toBe(1);
  });
});
