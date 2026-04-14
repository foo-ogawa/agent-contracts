import { resolve, join } from "node:path";
import { describe, it, expect } from "vitest";
import { loadDsl, DslLoadError } from "../../src/loader/index.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");

describe("loadDsl", () => {
  describe("single file loading", () => {
    it("loads minimal fixture", async () => {
      const result = await loadDsl(join(fixturesDir, "minimal/agent-contracts.yaml"));
      expect(result.data).toBeDefined();
      expect(result.data["version"]).toBe(1);
      expect(result.data["system"]).toEqual({
        id: "minimal-system",
        name: "Minimal Agent Workflow",
        default_phase_order: ["analyze", "implement"],
      });
      const agents = result.data["agents"] as Record<string, unknown>;
      expect(typeof agents).toBe("object");
      expect(agents["implementer"]).toBeDefined();
    });

    it("loads full fixture with x- properties", async () => {
      const result = await loadDsl(join(fixturesDir, "full/agent-contracts.yaml"));
      expect(result.data["version"]).toBe(1);
      expect(result.data["extends"]).toBe("@agent-contracts/base-team");
      const agents = result.data["agents"] as Record<string, Record<string, unknown>>;
      expect(Object.keys(agents).length).toBeGreaterThan(0);
      expect(agents["main-architect"]["x-identity"]).toBeDefined();
    });

    it("returns absolute filePath", async () => {
      const result = await loadDsl(join(fixturesDir, "minimal/agent-contracts.yaml"));
      expect(result.filePath).toBe(
        resolve(join(fixturesDir, "minimal/agent-contracts.yaml")),
      );
    });
  });

  describe("multi-file ($ref) loading", () => {
    it("resolves $ref for agents, tasks, artifacts", async () => {
      const result = await loadDsl(
        join(fixturesDir, "multifile/agent-contracts.yaml"),
      );
      expect(result.data["version"]).toBe(1);

      const agents = result.data["agents"] as Record<string, Record<string, unknown>>;
      expect(Object.keys(agents)).toHaveLength(1);
      expect(agents["implementer"]).toBeDefined();

      const tasks = result.data["tasks"] as Record<string, Record<string, unknown>>;
      expect(Object.keys(tasks)).toHaveLength(1);
      expect(tasks["implement-feature"]).toBeDefined();

      const artifacts = result.data["artifacts"] as Record<string, Record<string, unknown>>;
      expect(Object.keys(artifacts)).toHaveLength(1);
      expect(artifacts["codebase"]).toBeDefined();
    });

    it("resolves $ref relative to entry point directory", async () => {
      const result = await loadDsl(
        join(fixturesDir, "multifile/agent-contracts.yaml"),
      );
      const agents = result.data["agents"] as Record<string, Record<string, unknown>>;
      expect(agents["implementer"]["role_name"]).toBe("Implementer");
    });

    it("errors on $ref to non-existent file", async () => {
      const tmpDir = join(fixturesDir, "multifile");
      const { writeFile, unlink } = await import("node:fs/promises");
      const tmpPath = join(tmpDir, "_broken-ref.yaml");
      await writeFile(
        tmpPath,
        'version: 1\nsystem:\n  id: x\n  name: X\n  default_phase_order: []\nagents: { $ref: "./nonexistent.yaml" }\n',
      );
      try {
        await expect(loadDsl(tmpPath)).rejects.toThrow(DslLoadError);
        await expect(loadDsl(tmpPath)).rejects.toThrow("File not found");
      } finally {
        await unlink(tmpPath);
      }
    });
  });

  describe("version check", () => {
    it("rejects missing version", async () => {
      await expect(
        loadDsl(join(fixturesDir, "invalid/missing-version.yaml")),
      ).rejects.toThrow("Missing DSL version");
    });

    it("rejects wrong version number", async () => {
      await expect(
        loadDsl(join(fixturesDir, "invalid/wrong-version.yaml")),
      ).rejects.toThrow("Unsupported DSL version");
      await expect(
        loadDsl(join(fixturesDir, "invalid/wrong-version.yaml")),
      ).rejects.toThrow("expected 1, got 2");
    });

    it("rejects version as string", async () => {
      await expect(
        loadDsl(join(fixturesDir, "invalid/bad-type.yaml")),
      ).rejects.toThrow("Unsupported DSL version");
    });
  });

  describe("error handling", () => {
    it("errors on non-existent file", async () => {
      await expect(
        loadDsl("/tmp/agent-contracts-nonexistent-file.yaml"),
      ).rejects.toThrow(DslLoadError);
      await expect(
        loadDsl("/tmp/agent-contracts-nonexistent-file.yaml"),
      ).rejects.toThrow("File not found");
    });

    it("errors on invalid YAML syntax", async () => {
      await expect(
        loadDsl(join(fixturesDir, "invalid/bad-yaml-syntax.yaml")),
      ).rejects.toThrow(DslLoadError);
      await expect(
        loadDsl(join(fixturesDir, "invalid/bad-yaml-syntax.yaml")),
      ).rejects.toThrow("Invalid YAML syntax");
    });
  });
});
