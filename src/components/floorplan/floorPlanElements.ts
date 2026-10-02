import {
  Bath,
  DoorOpen,
  Info,
  LogOut,
  MoveHorizontal,
  Presentation,
  Square,
  Type,
  Utensils,
  type LucideIcon,
} from "lucide-react";

// What the non-stall things on a floor plan look like. Shared by the organizer
// editor and the public map so an aisle or stage reads the same in both.

export type ElementType = "aisle" | "entrance" | "exit" | "stage" | "restroom" | "food" | "info" | "pillar" | "label";

export interface ElementGeometry {
  id: string;
  type: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface ElementMeta {
  /** Name shown in the palette and used when no label text was entered. */
  name: string;
  icon: LucideIcon;
  /** Size in canvas units when first added. */
  width: number;
  height: number;
  /** Box styling; "label" has none because it is just text. */
  className: string;
  textClassName: string;
  /** Whether the type's own name is drawn when the organizer typed no text. */
  showNameByDefault: boolean;
}

export const ELEMENT_ORDER: ElementType[] = ["aisle", "entrance", "exit", "stage", "restroom", "food", "info", "pillar", "label"];

export const ELEMENT_META: Record<ElementType, ElementMeta> = {
  aisle: {
    name: "Aisle",
    icon: MoveHorizontal,
    width: 400,
    height: 40,
    className: "bg-slate-200/70 border border-dashed border-slate-400 rounded-sm",
    textClassName: "text-slate-600",
    showNameByDefault: false,
  },
  entrance: {
    name: "Entrance",
    icon: DoorOpen,
    width: 120,
    height: 44,
    className: "bg-emerald-100 border-2 border-emerald-600 rounded-md",
    textClassName: "text-emerald-900",
    showNameByDefault: true,
  },
  exit: {
    name: "Exit",
    icon: LogOut,
    width: 120,
    height: 44,
    className: "bg-red-100 border-2 border-red-500 rounded-md",
    textClassName: "text-red-900",
    showNameByDefault: true,
  },
  stage: {
    name: "Stage",
    icon: Presentation,
    width: 300,
    height: 150,
    className: "bg-violet-100 border-2 border-violet-500 rounded-md",
    textClassName: "text-violet-900",
    showNameByDefault: true,
  },
  restroom: {
    name: "Restrooms",
    icon: Bath,
    width: 120,
    height: 80,
    className: "bg-sky-100 border-2 border-sky-500 rounded-md",
    textClassName: "text-sky-900",
    showNameByDefault: true,
  },
  food: {
    name: "Food court",
    icon: Utensils,
    width: 160,
    height: 110,
    className: "bg-orange-100 border-2 border-orange-500 rounded-md",
    textClassName: "text-orange-900",
    showNameByDefault: true,
  },
  info: {
    name: "Info desk",
    icon: Info,
    width: 110,
    height: 70,
    className: "bg-blue-100 border-2 border-blue-500 rounded-md",
    textClassName: "text-blue-900",
    showNameByDefault: true,
  },
  pillar: {
    name: "Pillar",
    icon: Square,
    width: 36,
    height: 36,
    className: "bg-slate-500/80 border-2 border-slate-700 rounded-full",
    textClassName: "text-white",
    showNameByDefault: false,
  },
  label: {
    name: "Text label",
    icon: Type,
    width: 180,
    height: 36,
    className: "",
    textClassName: "text-foreground text-sm font-semibold",
    showNameByDefault: false,
  },
};

// Elements sit underneath every stall. Stall stacking order is limited to
// +/-100000, so a layer below that can never cover a stall.
export const ELEMENT_LAYER_Z_INDEX = -100001;

export function isElementType(value: string): value is ElementType {
  return value in ELEMENT_META;
}

/** Metadata for a type, falling back to a plain box for a type this build does not know. */
export function elementMeta(type: string): ElementMeta {
  return isElementType(type) ? ELEMENT_META[type] : ELEMENT_META.aisle;
}

/** The text drawn inside an element: its own label, else the type's name where that makes sense. */
export function elementText(element: Pick<ElementGeometry, "type" | "label">): string {
  const own = element.label?.trim();
  if (own) return own;
  const meta = elementMeta(element.type);
  return meta.showNameByDefault ? meta.name : "";
}

/** A short human name for toasts and undo labels. */
export function elementName(element: Pick<ElementGeometry, "type" | "label">): string {
  const own = element.label?.trim();
  const meta = elementMeta(element.type);
  return own ? `${meta.name.toLowerCase()} "${own}"` : meta.name.toLowerCase();
}
