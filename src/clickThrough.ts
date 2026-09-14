export type Point = { x: number; y: number };

export type HitRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Extra CSS pixels used to regain the pet after ignore-cursor-events is on. */
export const REGAIN_PAD_PX = 18;

/** Extra CSS pixels kept while the pet is interactive, to avoid edge flicker. */
export const HOLD_PAD_PX = 10;

/** Wider pads while the window is walking so the moving hit box is easier to grab. */
export const MOVING_HOLD_PAD_PX = 22;
export const MOVING_REGAIN_PAD_PX = 36;

/** Stay interactive this long after the cursor leaves a hit, then pass through. */
export const IGNORE_AFTER_MS = 120;

export function hitPad(currentlyIgnoring: boolean, moving = false): number {
  if (moving) {
    return currentlyIgnoring ? MOVING_REGAIN_PAD_PX : MOVING_HOLD_PAD_PX;
  }
  return currentlyIgnoring ? REGAIN_PAD_PX : HOLD_PAD_PX;
}

/** Convert a desktop physical cursor point into window-local CSS pixels. */
export function cursorToWindowLocal(
  cursor: Point,
  windowOrigin: Point,
  scale: number,
): Point {
  const s = scale > 0 ? scale : 1;
  return {
    x: (cursor.x - windowOrigin.x) / s,
    y: (cursor.y - windowOrigin.y) / s,
  };
}

export function pointInRect(point: Point, rect: HitRect, pad = 0): boolean {
  return (
    point.x >= rect.left - pad &&
    point.x <= rect.right + pad &&
    point.y >= rect.top - pad &&
    point.y <= rect.bottom + pad
  );
}

export function rectsFromElements(
  elements: Array<Element | null | undefined>,
): HitRect[] {
  const rects: HitRect[] = [];
  for (const el of elements) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return rects;
}

/**
 * True when the OS should receive the click (transparent padding).
 * False while dragging, or while the cursor is over the pet / menu.
 */
export function shouldIgnoreCursorEvents(input: {
  pinned: boolean;
  local: Point;
  hits: HitRect[];
  currentlyIgnoring: boolean;
  moving?: boolean;
}): boolean {
  if (input.pinned) return false;
  const pad = hitPad(input.currentlyIgnoring, input.moving ?? false);
  return !input.hits.some((rect) => pointInRect(input.local, rect, pad));
}

/**
 * Time-gate turning click-through ON. Turning it OFF is immediate so the pet
 * stays grabbable while the walk loop and the cursor poll race.
 */
export function releaseIgnoreCursorEvents(input: {
  wantIgnore: boolean;
  currentlyIgnoring: boolean;
  outsideMs: number;
  afterMs?: number;
}): boolean {
  if (!input.wantIgnore) return false;
  if (input.currentlyIgnoring) return true;
  return input.outsideMs >= (input.afterMs ?? IGNORE_AFTER_MS);
}
