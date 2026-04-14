import { createRulesetFunction } from "@stoplight/spectral-core";

/**
 * Validates that the editors array is not empty.
 * Section 15.2.2: artifact responsibility integrity — editors must have at least one entry.
 */
export default createRulesetFunction<string[], null>(
  { input: { type: "array" }, options: null },
  (targetVal, _options, _context) => {
    if (targetVal.length === 0) {
      return [{ message: "editors must not be empty" }];
    }
    return [];
  },
);
