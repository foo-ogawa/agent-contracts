import { describe, it, expect } from "vitest";
import { isMultiTeamConfig, getTeamEntries } from "../../src/cli/multi-team.js";
import type { ResolvedConfig, ResolvedTeamConfig } from "../../src/config/types.js";

function makeConfig(teams?: Record<string, ResolvedTeamConfig>): ResolvedConfig {
  return {
    dsl: teams ? "" : "./test.yaml",
    renders: [],
    configDir: "/tmp",
    bindings: teams ? [] : ["./b.yaml"],
    teams,
  };
}

describe("isMultiTeamConfig", () => {
  it("returns true when teams present with entries", () => {
    expect(
      isMultiTeamConfig(makeConfig({ t1: { dsl: "a.yaml", bindings: [] } })),
    ).toBe(true);
  });

  it("returns false when no teams", () => {
    expect(isMultiTeamConfig(makeConfig())).toBe(false);
  });

  it("returns false when teams is empty", () => {
    expect(isMultiTeamConfig(makeConfig({}))).toBe(false);
  });
});

describe("getTeamEntries", () => {
  const config = makeConfig({
    backend: { dsl: "b.yaml", bindings: [] },
    qa: { dsl: "q.yaml", bindings: [] },
  });

  it("returns all teams when no filter", () => {
    const entries = getTeamEntries(config);
    expect(entries).toHaveLength(2);
    expect(entries.map(([k]) => k)).toEqual(["backend", "qa"]);
  });

  it("filters to single team", () => {
    const entries = getTeamEntries(config, "backend");
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toBe("backend");
  });

  it("throws for unknown team", () => {
    expect(() => getTeamEntries(config, "nonexistent")).toThrow(
      /Team "nonexistent" not found/,
    );
  });

  it("returns empty array when config has no teams", () => {
    expect(getTeamEntries(makeConfig())).toEqual([]);
  });
});
