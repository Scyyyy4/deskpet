import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsAlwaysOnTopWatch } from "./platform.ts";

describe("needsAlwaysOnTopWatch", () => {
  it("only re-applies always-on-top on Linux desktops", () => {
    assert.equal(
      needsAlwaysOnTopWatch(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ),
      false,
    );
    assert.equal(
      needsAlwaysOnTopWatch(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
      false,
    );
    assert.equal(
      needsAlwaysOnTopWatch("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"),
      true,
    );
    assert.equal(
      needsAlwaysOnTopWatch("Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36"),
      false,
    );
  });
});
