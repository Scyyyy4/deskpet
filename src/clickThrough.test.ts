import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOLD_PAD_PX,
  REGAIN_PAD_PX,
  cursorToWindowLocal,
  pointInRect,
  shouldIgnoreCursorEvents,
} from "./clickThrough.ts";

const pet = { left: 30, top: 70, right: 150, bottom: 190 };

describe("cursorToWindowLocal", () => {
  it("subtracts the window origin and divides by the scale factor", () => {
    const local = cursorToWindowLocal(
      { x: 400, y: 260 },
      { x: 200, y: 100 },
      2,
    );
    assert.deepEqual(local, { x: 100, y: 80 });
  });

  it("treats a missing scale as 1", () => {
    const local = cursorToWindowLocal({ x: 50, y: 40 }, { x: 10, y: 10 }, 0);
    assert.deepEqual(local, { x: 40, y: 30 });
  });
});

describe("pointInRect", () => {
  it("includes the rectangle edges", () => {
    assert.equal(pointInRect({ x: 30, y: 70 }, pet), true);
    assert.equal(pointInRect({ x: 150, y: 190 }, pet), true);
    assert.equal(pointInRect({ x: 29, y: 130 }, pet), false);
  });

  it("expands by pad", () => {
    assert.equal(pointInRect({ x: 28, y: 130 }, pet, 2), true);
    assert.equal(pointInRect({ x: 27, y: 130 }, pet, 2), false);
  });
});

describe("shouldIgnoreCursorEvents", () => {
  it("never ignores while a drag is pinned", () => {
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: true,
        local: { x: 0, y: 0 },
        hits: [pet],
        currentlyIgnoring: false,
      }),
      false,
    );
  });

  it("ignores transparent padding and keeps the pet interactive", () => {
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: false,
        local: { x: 8, y: 8 },
        hits: [pet],
        currentlyIgnoring: false,
      }),
      true,
    );
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: false,
        local: { x: 90, y: 130 },
        hits: [pet],
        currentlyIgnoring: true,
      }),
      false,
    );
  });

  it("uses a wider pad to regain the pet after click-through is on", () => {
    const justOutside = { x: pet.left - HOLD_PAD_PX - 1, y: 130 };
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: false,
        local: justOutside,
        hits: [pet],
        currentlyIgnoring: false,
      }),
      true,
    );
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: false,
        local: { x: pet.left - REGAIN_PAD_PX, y: 130 },
        hits: [pet],
        currentlyIgnoring: true,
      }),
      false,
    );
  });

  it("treats the menu as a hit target", () => {
    const menu = { left: 80, top: 8, right: 172, bottom: 72 };
    assert.equal(
      shouldIgnoreCursorEvents({
        pinned: false,
        local: { x: 100, y: 20 },
        hits: [pet, menu],
        currentlyIgnoring: true,
      }),
      false,
    );
  });
});
