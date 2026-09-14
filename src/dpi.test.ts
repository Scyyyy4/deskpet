import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cssPixelScale } from "./dpi.ts";

describe("cssPixelScale", () => {
  it("uses the live outer/inner ratio instead of a hardcoded DPR", () => {
    assert.equal(cssPixelScale(360, 180, 1), 2);
    assert.equal(cssPixelScale(180, 180, 2), 1);
  });

  it("falls back when a side is missing", () => {
    assert.equal(cssPixelScale(0, 180, 1.5), 1.5);
    assert.equal(cssPixelScale(180, 0, 0), 1);
  });
});
