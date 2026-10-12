import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import ComplianceAgentChat from "./compliance-agent-chat";
import {
  clampWidgetPosition,
  readStoredWidgetPosition,
  resolvePanelPlacement,
  storeWidgetPosition,
  type WidgetPoint,
  type WidgetSize,
} from "@/lib/widget-position";

const PANEL_WIDTH = 384; // w-[24rem]
const PANEL_HEIGHT = 416; // h-[26rem]
const GAP = 12;
const DRAG_THRESHOLD = 4;
/** Ignore the click that some browsers emit right after a drag ends. */
const CLICK_AFTER_DRAG_MS = 350;

/**
 * Floating, draggable chat window for the compliance co-pilot.
 *
 * Mounted by the app layout so the assistant is one click away on every page.
 * The launcher can be dragged anywhere in the viewport (pointer events, so touch
 * and pen work too) and the position is remembered across pages and reloads.
 * Hidden on the dedicated `/asistente` page and on small screens, where the
 * bottom navigation links to `/asistente` instead.
 */
export default function ComplianceAgentWidget() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  const launcherRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: WidgetPoint } | null>(null);
  const movedRef = useRef(false);
  const dragEndedAtRef = useRef(0);
  const positionRef = useRef<WidgetPoint>({ x: 0, y: 0 });

  const [viewport, setViewport] = useState<WidgetSize>(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [launcher, setLauncher] = useState<WidgetSize>({ width: 0, height: 0 });
  const [position, setPosition] = useState<WidgetPoint | null>(null);

  const applyPosition = useCallback((point: WidgetPoint) => {
    positionRef.current = point;
    setPosition(point);
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The launcher width depends on its label, so measure it before positioning.
  useLayoutEffect(() => {
    const rect = launcherRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      setLauncher({ width: rect.width, height: rect.height });
    }
  }, [viewport]);

  // First position: the stored one, else the bottom-right corner.
  useEffect(() => {
    if (position || launcher.width === 0) return;
    const fallback: WidgetPoint = {
      x: viewport.width - launcher.width - 24,
      y: viewport.height - launcher.height - 112,
    };
    applyPosition(clampWidgetPosition(readStoredWidgetPosition() ?? fallback, launcher, viewport));
  }, [position, launcher, viewport, applyPosition]);

  // Keep a dragged widget on screen when the window shrinks.
  useEffect(() => {
    if (!position || launcher.width === 0) return;
    const next = clampWidgetPosition(position, launcher, viewport);
    if (next.x !== position.x || next.y !== position.y) applyPosition(next);
  }, [viewport, launcher, position, applyPosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: positionRef.current };
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!movedRef.current && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) {
      return;
    }
    movedRef.current = true;
    applyPosition(
      clampWidgetPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, launcher, viewport),
    );
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (movedRef.current) {
      dragEndedAtRef.current = Date.now();
      storeWidgetPosition(positionRef.current);
    }
  };

  const handleClick = () => {
    if (Date.now() - dragEndedAtRef.current < CLICK_AFTER_DRAG_MS) return;
    setOpen((value) => !value);
  };

  if (location === "/asistente") return null;

  const placement = position
    ? resolvePanelPlacement(
        position,
        launcher,
        viewport,
        { width: PANEL_WIDTH, height: PANEL_HEIGHT },
        GAP,
      )
    : { openUp: false, alignRight: false };

  const panelStyle: CSSProperties = {
    ...(placement.openUp ? { bottom: `calc(100% + ${GAP}px)` } : { top: `calc(100% + ${GAP}px)` }),
    ...(placement.alignRight ? { right: 0 } : { left: 0 }),
  };


  return (
    <div
      className="fixed z-40 hidden lg:block"
      style={
        position
          ? { left: position.x, top: position.y }
          : { right: 24, bottom: 112, visibility: "hidden" }
      }
      data-testid="compliance-agent-widget"
    >
      {open && (
        <div
          className="absolute overflow-hidden rounded-lg bg-white shadow-[0_20px_50px_-20px_rgba(27,22,17,0.55)]"
          style={panelStyle}
        >
          <ComplianceAgentChat className="h-[26rem] w-[24rem] rounded-none border-0" />
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onClick={handleClick}
        className="flex h-14 cursor-grab touch-none select-none items-center gap-2 rounded-full bg-[#1b1611] px-5 text-white shadow-[0_14px_30px_-10px_rgba(27,22,17,0.85)] transition-colors hover:bg-[#3d342b] active:cursor-grabbing"
        aria-expanded={open}
        aria-label="Abrir el Copiloto de Cumplimiento (arrástralo para moverlo)"
        title="Copiloto de Cumplimiento — arrastra para mover"
        data-testid="compliance-agent-launcher"
      >
        <span className="material-icons">{open ? "close" : "smart_toy"}</span>
        <span className="text-sm font-medium">Asistente</span>
      </button>
    </div>
  );
}
