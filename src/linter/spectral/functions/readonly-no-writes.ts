import { createRulesetFunction } from "@stoplight/spectral-core";

type AgentObj = {
  mode?: string;
  can_write_artifacts?: string[];
};

/**
 * Section 15.2.7: read-only agent must have empty can_write_artifacts.
 */
export default createRulesetFunction<AgentObj, null>(
  { input: { type: "object" }, options: null },
  (targetVal, _options, _context) => {
    if (
      targetVal.mode === "read-only" &&
      Array.isArray(targetVal.can_write_artifacts) &&
      targetVal.can_write_artifacts.length > 0
    ) {
      return [
        {
          message:
            'Agent with mode "read-only" must have empty can_write_artifacts',
          path: [..._context.path, "can_write_artifacts"],
        },
      ];
    }
    return [];
  },
);
