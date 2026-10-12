/**
 * Geometry for the draggable compliance agent widget.
 *
 * Kept free of React and of the DOM so the fiddly parts - clamping the widget to
 * the viewport and deciding on which side the chat panel opens - are plain,
 * testable functions. The widget component only wires pointer events to these.
 */

export interface WidgetPoint {
  x: number;
  y: number;
}

export interface WidgetSize {
  width: number;
  height: number;
}

/** Gap kept between the widget and the viewport edges. */
export const WIDGET_MARGIN = 8;

const POSITION_KEY_STORAGE = "librovirtual.agentWidget.position";

/** Keeps the widget's top-left corner inside the viewport. */
export function clampWidgetPosition(
  point: WidgetPoint,
  size: WidgetSize,
  viewport: WidgetSize,
): WidgetPoint {
  const maxX = Math.max(WIDGET_MARGIN, viewport.width - size.width - WIDGET_MARGIN);
  const maxY = Math.max(WIDGET_MARGIN, viewport.height - size.height - WIDGET_MARGIN);

  return {
    x: Math.min(Math.max(point.x, WIDGET_MARGIN), maxX),
    y: Math.min(Math.max(point.y, WIDGET_MARGIN), maxY),
  };
}

export interface PanelPlacement {
  /** Open the panel above the launcher (instead of below it). */
  openUp: boolean;
  /** Align the panel's right edge with the launcher (instead of its left edge). */
  alignRight: boolean;
}

/**
 * Picks the side the chat panel opens on, preferring the side where it fits.
 * When it fits on neither side it falls back to below / left.
 */
export function resolvePanelPlacement(
  position: WidgetPoint,
  launcher: WidgetSize,
  viewport: WidgetSize,
  panel: WidgetSize,
  gap: number,
): PanelPlacement {
  const fitsBelow =
    position.y + launcher.height + gap + panel.height <= viewport.height - WIDGET_MARGIN;
  const fitsAbove = position.y - gap - panel.height >= WIDGET_MARGIN;

  const fitsLeft = position.x + panel.width <= viewport.width - WIDGET_MARGIN;
  const fitsRight = position.x + launcher.width - panel.width >= WIDGET_MARGIN;

  return {
    openUp: !fitsBelow && fitsAbove,
    alignRight: !fitsLeft && fitsRight,
  };
}

/** Reads the last dragged position, or null when absent/unreadable. */
export function readStoredWidgetPosition(): WidgetPoint | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WidgetPoint>;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persists the dragged position; storage may be unavailable (private mode). */
export function storeWidgetPosition(point: WidgetPoint): void {
  try {
    window.localStorage.setItem(POSITION_KEY_STORAGE, JSON.stringify(point));
  } catch {
    // Not fatal: the widget simply forgets its position on the next load.
  }
}
