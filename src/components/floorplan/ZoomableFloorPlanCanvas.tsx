import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZoomableFloorPlanCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl?: string | null;
  /** Stall markers, positioned absolutely in canvas units. */
  children: ReactNode;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.4;
// Matches the p-4 padding around the canvas inside the scroll container.
const PADDING = 32;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Read-only floor plan viewport shared by the public map and the exhibitor
 * stall picker. The plan starts fitted to the available width (an overview),
 * and can be zoomed with the buttons or a two-finger pinch and panned by
 * scrolling, so stalls stay tappable on a phone even when the plan is a
 * thousand canvas units wide.
 */
export function ZoomableFloorPlanCanvas({ canvasWidth, canvasHeight, backgroundUrl, children }: ZoomableFloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;

  // Canvas point to keep centred in the viewport across a zoom change.
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const available = el.clientWidth - PADDING;
      if (available > 0) setFitScale(Math.min(1, available / canvasWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasWidth]);

  // After the scale changes, restore the remembered centre so zooming feels anchored.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const point = anchor.current;
    if (!el || !point) return;
    anchor.current = null;
    el.scrollLeft = Math.max(0, point.x * scale + PADDING / 2 - el.clientWidth / 2);
    el.scrollTop = Math.max(0, point.y * scale + PADDING / 2 - el.clientHeight / 2);
  }, [scale]);

  const changeZoom = useCallback(
    (next: number) => {
      const el = containerRef.current;
      if (el && scale > 0) {
        anchor.current = {
          x: (el.scrollLeft + el.clientWidth / 2 - PADDING / 2) / scale,
          y: (el.scrollTop + el.clientHeight / 2 - PADDING / 2) / scale,
        };
      }
      setZoom(clampZoom(next));
    },
    [scale]
  );

  function distance(touches: React.TouchList): number {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  return (
    <div className="min-w-0 max-w-full space-y-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground mr-auto sm:hidden">Pinch or use + to zoom, drag to move</span>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom / ZOOM_STEP)}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs tabular-nums w-10 text-center" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom * ZOOM_STEP)}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => changeZoom(1)} disabled={zoom === 1}>
          <Maximize className="w-3.5 h-3.5 mr-1" />
          Fit
        </Button>
      </div>

      <div
        ref={containerRef}
        className="bg-muted/30 rounded-xl border border-border overflow-auto max-w-full max-h-[75vh]"
        // touchAction: pinch is handled below, so the browser must not zoom the whole page.
        // contain: the canvas can be wider than the screen; it must scroll inside this box,
        // not widen a grid/flex parent (which would also make "fit" measure the wrong width).
        style={{ touchAction: "pan-x pan-y", contain: "inline-size" }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = { distance: distance(e.touches), zoom };
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinch.current || pinch.current.distance === 0) return;
          changeZoom(pinch.current.zoom * (distance(e.touches) / pinch.current.distance));
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinch.current = null;
        }}
      >
        <div className="p-4">
          <div style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
            <div
              className="relative bg-card border border-border rounded-lg"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
