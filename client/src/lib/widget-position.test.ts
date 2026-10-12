import { describe, expect, it } from "vitest";
import {
  clampWidgetPosition,
  resolvePanelPlacement,
  WIDGET_MARGIN,
} from "./widget-position";

const viewport = { width: 1440, height: 900 };
const launcher = { width: 140, height: 56 };
const panel = { width: 384, height: 416 };

describe("clampWidgetPosition", () => {
  it("keeps an in-bounds position untouched", () => {
    expect(clampWidgetPosition({ x: 400, y: 300 }, launcher, viewport)).toEqual({ x: 400, y: 300 });
  });

  it("pulls a position dragged past the left/top edges back to the margin", () => {
    expect(clampWidgetPosition({ x: -50, y: -20 }, launcher, viewport)).toEqual({
      x: WIDGET_MARGIN,
      y: WIDGET_MARGIN,
    });
  });

  it("pulls a position dragged past the right/bottom edges fully into view", () => {
    expect(clampWidgetPosition({ x: 5000, y: 5000 }, launcher, viewport)).toEqual({
      x: viewport.width - launcher.width - WIDGET_MARGIN,
      y: viewport.height - launcher.height - WIDGET_MARGIN,
    });
  });

  it("degrades to the margin when the viewport is smaller than the widget", () => {
    expect(clampWidgetPosition({ x: 100, y: 100 }, launcher, { width: 100, height: 40 })).toEqual({
      x: WIDGET_MARGIN,
      y: WIDGET_MARGIN,
    });
  });
});

describe("resolvePanelPlacement", () => {
  it("opens downwards when there is room below", () => {
    const placement = resolvePanelPlacement({ x: 40, y: 40 }, launcher, viewport, panel, 12);
    expect(placement).toEqual({ openUp: false, alignRight: false });
  });

  it("flips upwards when the launcher sits near the bottom edge", () => {
    const bottom = { x: 40, y: viewport.height - launcher.height - 112 };
    const placement = resolvePanelPlacement(bottom, launcher, viewport, panel, 12);
    expect(placement.openUp).toBe(true);
  });

  it("aligns the panel to the right when the launcher sits near the right edge", () => {
    const right = { x: viewport.width - launcher.width - 24, y: 40 };
    const placement = resolvePanelPlacement(right, launcher, viewport, panel, 12);
    expect(placement.alignRight).toBe(true);
  });

  it("keeps left alignment in the middle of a large viewport", () => {
    const placement = resolvePanelPlacement({ x: 500, y: 40 }, launcher, viewport, panel, 12);
    expect(placement.alignRight).toBe(false);
  });
});
