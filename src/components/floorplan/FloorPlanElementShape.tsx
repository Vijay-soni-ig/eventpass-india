import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ELEMENT_LAYER_Z_INDEX, elementMeta, elementText, type ElementGeometry } from "./floorPlanElements";

interface FloorPlanElementShapeProps extends HTMLAttributes<HTMLDivElement> {
  element: ElementGeometry;
  children?: ReactNode;
}

/** One aisle / entrance / stage / label, positioned in canvas units. */
export function FloorPlanElementShape({ element, className, style, children, ...rest }: FloorPlanElementShapeProps) {
  const meta = elementMeta(element.type);
  const text = elementText(element);
  return (
    <div
      {...rest}
      className={cn("absolute flex items-center justify-center overflow-hidden text-center select-none", meta.className, className)}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        ...style,
      }}
    >
      {text && <span className={cn("px-1 text-[11px] font-medium leading-tight pointer-events-none", meta.textClassName)}>{text}</span>}
      {children}
    </div>
  );
}

interface FloorPlanElementsLayerProps {
  elements: Array<{
    id: string;
    type: string;
    label: string | null;
    x: string | number;
    y: string | number;
    width: string | number;
    height: string | number;
    rotation: string | number;
    zIndex: number;
  }>;
}

/** Read-only layer for the public map and the exhibitor picker. */
export function FloorPlanElementsLayer({ elements }: FloorPlanElementsLayerProps) {
  if (elements.length === 0) return null;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: ELEMENT_LAYER_Z_INDEX }}>
      {elements.map((element) => (
        <FloorPlanElementShape
          key={element.id}
          element={{
            id: element.id,
            type: element.type,
            label: element.label,
            x: Number(element.x),
            y: Number(element.y),
            width: Number(element.width),
            height: Number(element.height),
            rotation: Number(element.rotation),
            zIndex: element.zIndex,
          }}
        />
      ))}
    </div>
  );
}
