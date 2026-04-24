import type { ResolvedConfig, ResolvedTeamConfig } from "../config/types.js";

export function isMultiTeamConfig(config: ResolvedConfig): boolean {
  return config.teams !== undefined && Object.keys(config.teams).length > 0;
}

export function getTeamEntries(
  config: ResolvedConfig,
  teamFilter?: string,
): [string, ResolvedTeamConfig][] {
  if (!config.teams) return [];
  const entries = Object.entries(config.teams);
  if (teamFilter) {
    const found = entries.filter(([k]) => k === teamFilter);
    if (found.length === 0) {
      throw new Error(
        `Team "${teamFilter}" not found. Available teams: ${entries.map(([k]) => k).join(", ")}`,
      );
    }
    return found;
  }
  return entries;
}
