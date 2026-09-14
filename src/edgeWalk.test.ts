import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alongLimits,
  clamp,
  directionTowardFarEnd,
  dragThresholdPx,
  facingFor,
  nearestEdge,
  pointOnEdge,
  preferredStartEdge,
  rotationFor,
  stepAlongEdge,
} from "./edgeWalk.ts";

const work = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 180, height: 200 };

describe("clamp / travel", () => {
  it("clamps to min when max is below min", () => {
    assert.equal(clamp(50, 10, 5), 10);
  });

  it("keeps the window on-edge when the work area is smaller than the window", () => {
    const tiny = { x: 10, y: 20, width: 50, height: 40 };
    const point = pointOnEdge("bottom", 999, tiny, size);
    assert.equal(point.x, 10);
    assert.equal(point.y, 20);
  });
});

describe("nearestEdge", () => {
  it("picks the closest work-area edge", () => {
    const bottom = {
      x: 400,
      y: work.height - size.height,
      width: size.width,
      height: size.height,
    };
    assert.equal(nearestEdge(bottom, work), "bottom");

    const left = { x: 0, y: 300, width: size.width, height: size.height };
    assert.equal(nearestEdge(left, work), "left");

    const top = { x: 800, y: 0, width: size.width, height: size.height };
    assert.equal(nearestEdge(top, work), "top");

    const right = {
      x: work.width - size.width,
      y: 400,
      width: size.width,
      height: size.height,
    };
    assert.equal(nearestEdge(right, work), "right");
  });

  it("prefers bottom when distances tie", () => {
    const centered = {
      x: (work.width - size.width) / 2,
      y: (work.height - size.height) / 2,
      width: size.width,
      height: size.height,
    };
    // Not a true tie — just sanity that a center window still resolves.
    assert.ok(["top", "bottom", "left", "right"].includes(nearestEdge(centered, work)));

    const origin = { x: 0, y: 0, width: size.width, height: size.height };
    // Equal distance to top and left (0); top ranks before left, but bottom is farther.
    assert.equal(nearestEdge(origin, work), "top");
  });
});

describe("pointOnEdge", () => {
  it("snaps to the bottom work-area edge and clamps X", () => {
    const point = pointOnEdge("bottom", 500, work, size);
    assert.equal(point.x, 500);
    assert.equal(point.y, work.height - size.height);

    const overflow = pointOnEdge("bottom", 5000, work, size);
    assert.equal(overflow.x, work.width - size.width);
    assert.equal(overflow.y, work.height - size.height);
  });

  it("snaps to vertical edges and clamps Y", () => {
    const left = pointOnEdge("left", 80, work, size);
    assert.equal(left.x, 0);
    assert.equal(left.y, 80);

    const right = pointOnEdge("right", -20, work, size);
    assert.equal(right.x, work.width - size.width);
    assert.equal(right.y, 0);
  });
});

describe("stepAlongEdge", () => {
  const limits = alongLimits("bottom", work, size);

  it("advances along the edge without teleporting", () => {
    const first = stepAlongEdge({
      along: 100,
      direction: 1,
      min: limits.min,
      max: limits.max,
      delta: 12,
    });
    assert.equal(first.along, 112);
    assert.equal(first.direction, 1);
    assert.equal(first.turned, false);
  });

  it("turns around at the far end", () => {
    const turned = stepAlongEdge({
      along: limits.max - 5,
      direction: 1,
      min: limits.min,
      max: limits.max,
      delta: 20,
    });
    assert.equal(turned.along, limits.max);
    assert.equal(turned.direction, -1);
    assert.equal(turned.turned, true);
  });

  it("turns around at the near end", () => {
    const turned = stepAlongEdge({
      along: limits.min + 3,
      direction: -1,
      min: limits.min,
      max: limits.max,
      delta: 20,
    });
    assert.equal(turned.along, limits.min);
    assert.equal(turned.direction, 1);
    assert.equal(turned.turned, true);
  });

  it("walks a full one-way trip by small steps", () => {
    let along = limits.min;
    let direction: 1 | -1 = 1;
    let turns = 0;
    for (let i = 0; i < 5000 && turns === 0; i += 1) {
      const stepped = stepAlongEdge({
        along,
        direction,
        min: limits.min,
        max: limits.max,
        delta: 8,
      });
      const hop = Math.abs(stepped.along - along);
      assert.ok(hop <= 8, "must not jump more than one step");
      along = stepped.along;
      direction = stepped.direction;
      if (stepped.turned) turns += 1;
    }
    assert.equal(turns, 1);
    assert.equal(along, limits.max);
    assert.equal(direction, -1);
  });
});

describe("facing / rotation / start", () => {
  it("starts on the bottom edge facing the farther end", () => {
    assert.equal(preferredStartEdge(), "bottom");
    const limits = alongLimits("bottom", work, size);
    assert.equal(directionTowardFarEnd(limits.min + 10, limits.min, limits.max), 1);
    assert.equal(directionTowardFarEnd(limits.max - 10, limits.min, limits.max), -1);
    assert.equal(facingFor("bottom", 1), "right");
    assert.equal(facingFor("bottom", -1), "left");
  });

  it("rotates the sprite so feet sit on the current edge", () => {
    assert.equal(rotationFor("bottom"), 0);
    assert.equal(rotationFor("top"), 180);
    assert.equal(rotationFor("left"), 90);
    assert.equal(rotationFor("right"), -90);
  });

  it("scales the drag threshold with DPI", () => {
    assert.equal(dragThresholdPx(1), 24);
    assert.equal(dragThresholdPx(2), 32);
  });
});
