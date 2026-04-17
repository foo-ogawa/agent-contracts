import { describe, it, expect } from "vitest";
import { resolveBindingTargetPath } from "../../src/guardrail-generator/resolve-paths.js";

describe("resolveBindingTargetPath", () => {
  it("resolves a single path variable", () => {
    const { resolved, diagnostics } = resolveBindingTargetPath(
      "{cursor_root}/hooks.json",
      { cursor_root: ".cursor" },
      "cursor",
    );
    expect(diagnostics).toEqual([]);
    expect(resolved).toBe(".cursor/hooks.json");
  });

  it("resolves multiple variables in one target", () => {
    const { resolved, diagnostics } = resolveBindingTargetPath(
      "{root}/{sub}/file.txt",
      { root: "/a", sub: "b" },
      "x",
    );
    expect(diagnostics).toEqual([]);
    expect(resolved).toBe("/a/b/file.txt");
  });

  it("records an error diagnostic for an undefined variable", () => {
    const target = "{missing}/out";
    const { resolved, diagnostics } = resolveBindingTargetPath(
      target,
      { other: "v" },
      "mybind",
    );
    expect(resolved).toBe("{missing}/out");
    expect(diagnostics).toEqual([
      {
        path: "binding.mybind.outputs",
        message:
          'Path variable "missing" used in target "{missing}/out" but not defined in config.paths',
        severity: "error",
      },
    ]);
  });

  it("leaves the original placeholder when the variable is missing", () => {
    const { resolved } = resolveBindingTargetPath(
      "prefix/{nope}/suffix",
      {},
      "s",
    );
    expect(resolved).toBe("prefix/{nope}/suffix");
  });

  it("returns the target unchanged when there are no variables", () => {
    const { resolved, diagnostics } = resolveBindingTargetPath(
      "static/path/no-vars.yaml",
      { unused: "x" },
      "b",
    );
    expect(diagnostics).toEqual([]);
    expect(resolved).toBe("static/path/no-vars.yaml");
  });

  it("errors on variables when paths is empty", () => {
    const { resolved, diagnostics } = resolveBindingTargetPath(
      "{a}/x",
      {},
      "tool",
    );
    expect(resolved).toBe("{a}/x");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
  });

  it("emits one diagnostic per undefined variable", () => {
    const target = "{x}/{y}/z";
    const { resolved, diagnostics } = resolveBindingTargetPath(
      target,
      {},
      "bind",
    );
    expect(resolved).toBe("{x}/{y}/z");
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Path variable "x" used in target "{x}/{y}/z" but not defined in config.paths',
      'Path variable "y" used in target "{x}/{y}/z" but not defined in config.paths',
    ]);
  });
});
