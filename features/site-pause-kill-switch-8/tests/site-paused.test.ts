// Kill-switch toggle logic (src/site-paused.ts). Pure and SDK-free, so it imports
// directly without dragging in a route or the Anthropic SDK. Pins the contract the two
// cost-incurring routes depend on: only a recognized truthy value pauses; unset, blank,
// and falsy strings all run normally.
import { describe, it, expect } from "vitest";
import { isSitePaused, SITE_PAUSED_ENV } from "../../../src/site-paused";

const withEnv = (value: string | undefined): Record<string, string | undefined> =>
  value === undefined ? {} : { [SITE_PAUSED_ENV]: value };

describe("isSitePaused", () => {
  it("runs normally when the var is unset", () => {
    expect(isSitePaused(withEnv(undefined))).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes", "on", " On ", "True"])(
    "pauses for truthy value %j",
    (value) => {
      expect(isSitePaused(withEnv(value))).toBe(true);
    },
  );

  it.each(["", "  ", "0", "false", "no", "off", "disabled", "2"])(
    "runs normally for falsy/blank value %j",
    (value) => {
      expect(isSitePaused(withEnv(value))).toBe(false);
    },
  );
});
