import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_SCALE_STEP,
  clampScale,
  logicalSizeFromScale,
  nextScaleFromNudge,
  nextScaleFromWheel,
  nextSizeFromHandle,
  parseSavedSize,
  positionAfterScale,
  scaleFromLogicalSize,
  sizeForMenu,
  wheelShouldScale,
} from "./windowSize.ts";

describe("scale helpers", () => {
  it("treats the current 180×200 window as scale 1", () => {
    assert.equal(scaleFromLogicalSize(BASE_WIDTH, BASE_HEIGHT), 1);
    assert.deepEqual(logicalSizeFromScale(1), {
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
    });
  });

  it("clamps to the allowed range and keeps the 9:10 aspect", () => {
    assert.equal(clampScale(0.1), MIN_SCALE);
    assert.equal(clampScale(9), MAX_SCALE);
    assert.deepEqual(logicalSizeFromScale(2), { width: 360, height: 400 });
    assert.equal(scaleFromLogicalSize(90, 100), 0.5);
  });

  it("uses the limiting axis when the window is not a perfect 9:10", () => {
    assert.equal(scaleFromLogicalSize(360, 200), 1);
    assert.equal(scaleFromLogicalSize(180, 400), 1);
  });
});

describe("parseSavedSize", () => {
  it("returns null for missing or junk values", () => {
    assert.equal(parseSavedSize(null), null);
    assert.equal(parseSavedSize("nope"), null);
    assert.equal(parseSavedSize(JSON.stringify({ width: "x" })), null);
    assert.equal(parseSavedSize(JSON.stringify({ width: 0, height: 200 })), null);
  });

  it("snaps a saved size back onto the locked aspect", () => {
    assert.deepEqual(
      parseSavedSize(JSON.stringify({ width: 360, height: 400 })),
      { width: 360, height: 400 },
    );
    assert.deepEqual(
      parseSavedSize(JSON.stringify({ width: 400, height: 400 })),
      { width: 360, height: 400 },
    );
  });
});

describe("nextSizeFromHandle", () => {
  const start = { startWidth: BASE_WIDTH, startHeight: BASE_HEIGHT };

  it("grows from the east/south edges and plants the opposite origin", () => {
    const east = nextSizeFromHandle({ ...start, dir: "e", dx: 180, dy: 0 });
    assert.deepEqual(
      { width: east.width, height: east.height, shiftX: east.shiftX, shiftY: east.shiftY },
      { width: 360, height: 400, shiftX: 0, shiftY: 0 },
    );

    const south = nextSizeFromHandle({ ...start, dir: "s", dx: 0, dy: 200 });
    assert.deepEqual(
      {
        width: south.width,
        height: south.height,
        shiftX: south.shiftX,
        shiftY: south.shiftY,
      },
      { width: 360, height: 400, shiftX: 0, shiftY: 0 },
    );
  });

  it("shrinks from the west/north edges and moves the origin", () => {
    const west = nextSizeFromHandle({
      dir: "w",
      startWidth: 360,
      startHeight: 400,
      dx: 180,
      dy: 0,
    });
    assert.deepEqual(west, {
      width: 180,
      height: 200,
      shiftX: 180,
      shiftY: 0,
    });

    const north = nextSizeFromHandle({
      dir: "n",
      startWidth: 360,
      startHeight: 400,
      dx: 0,
      dy: 200,
    });
    assert.deepEqual(north, {
      width: 180,
      height: 200,
      shiftX: 0,
      shiftY: 200,
    });
  });

  it("uses the dominant axis on a corner drag", () => {
    const se = nextSizeFromHandle({ ...start, dir: "se", dx: 180, dy: 10 });
    assert.equal(se.width, 360);
    assert.equal(se.height, 400);
    assert.equal(se.shiftX, 0);
    assert.equal(se.shiftY, 0);

    const nw = nextSizeFromHandle({
      dir: "nw",
      startWidth: 360,
      startHeight: 400,
      dx: 10,
      dy: 200,
    });
    assert.equal(nw.width, 180);
    assert.equal(nw.height, 200);
    assert.equal(nw.shiftX, 180);
    assert.equal(nw.shiftY, 200);
  });

  it("clamps a huge drag to the max scale", () => {
    const huge = nextSizeFromHandle({ ...start, dir: "se", dx: 4000, dy: 4000 });
    assert.deepEqual(
      { width: huge.width, height: huge.height },
      logicalSizeFromScale(MAX_SCALE),
    );
  });
});

describe("wheel / attach-edge", () => {
  it("steps scale up and down and clamps the ends", () => {
    assert.equal(nextScaleFromWheel(1, -1), WHEEL_SCALE_STEP);
    assert.equal(nextScaleFromWheel(1, 1), 1 / WHEEL_SCALE_STEP);
    assert.equal(nextScaleFromWheel(MIN_SCALE, 100), MIN_SCALE);
    assert.equal(nextScaleFromWheel(MAX_SCALE, -100), MAX_SCALE);
    assert.equal(nextScaleFromWheel(1, 0), 1);
  });

  it("keeps the walking edge planted when the window scales", () => {
    const start = { x: 100, y: 800, width: 180, height: 200 };

    assert.deepEqual(
      positionAfterScale({
        ...start,
        edge: "bottom",
        nextWidth: 360,
        nextHeight: 400,
      }),
      { x: 10, y: 600 },
    );
    assert.deepEqual(
      positionAfterScale({
        ...start,
        edge: "top",
        nextWidth: 360,
        nextHeight: 400,
      }),
      { x: 10, y: 800 },
    );
    assert.deepEqual(
      positionAfterScale({
        ...start,
        edge: "left",
        nextWidth: 360,
        nextHeight: 400,
      }),
      { x: 100, y: 700 },
    );
    assert.deepEqual(
      positionAfterScale({
        ...start,
        edge: "right",
        nextWidth: 360,
        nextHeight: 400,
      }),
      { x: -80, y: 700 },
    );
  });

  it("only scales the pet when Ctrl or ⌘ is held", () => {
    assert.equal(
      wheelShouldScale({ deltaY: 40, ctrlKey: false, metaKey: false }),
      false,
    );
    assert.equal(
      wheelShouldScale({ deltaY: 40, ctrlKey: true, metaKey: false }),
      true,
    );
    assert.equal(
      wheelShouldScale({ deltaY: -12, ctrlKey: false, metaKey: true }),
      true,
    );
    assert.equal(
      wheelShouldScale({ deltaY: 0, ctrlKey: true, metaKey: false }),
      false,
    );
  });

  it("nudges scale the same way as a wheel tick", () => {
    assert.equal(nextScaleFromNudge(1, 1), WHEEL_SCALE_STEP);
    assert.equal(nextScaleFromNudge(1, -1), 1 / WHEEL_SCALE_STEP);
  });

  it("grows a tiny window to the menu-fit size and leaves a normal one alone", () => {
    assert.deepEqual(sizeForMenu({ width: 90, height: 100 }), {
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
    });
    assert.equal(sizeForMenu({ width: BASE_WIDTH, height: BASE_HEIGHT }), null);
    assert.equal(sizeForMenu({ width: 360, height: 400 }), null);
  });
});
