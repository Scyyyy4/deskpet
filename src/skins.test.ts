import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SKIN,
  SKIN_LABELS,
  SKINS,
  isSkin,
  parseSavedSkin,
} from "./skins.ts";

describe("built-in skins", () => {
  it("keeps the yellow blob as the default", () => {
    assert.equal(DEFAULT_SKIN, "blob");
    assert.equal(SKINS[0], "blob");
    assert.equal(SKIN_LABELS.blob, "Yellow blob");
  });

  it("ships at least three other distinct skins", () => {
    assert.ok(SKINS.length >= 4);
    assert.deepEqual([...SKINS], ["blob", "peach", "cat", "drop"]);
  });
});

describe("parseSavedSkin", () => {
  it("returns null for missing or unknown values", () => {
    assert.equal(parseSavedSkin(null), null);
    assert.equal(parseSavedSkin(undefined), null);
    assert.equal(parseSavedSkin(""), null);
    assert.equal(parseSavedSkin("nope"), null);
    assert.equal(parseSavedSkin("Yellow blob"), null);
  });

  it("accepts every built-in id", () => {
    for (const skin of SKINS) {
      assert.equal(parseSavedSkin(skin), skin);
      assert.equal(isSkin(skin), true);
    }
  });
});
