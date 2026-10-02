import { useEffect, useState } from "react";
import { ChevronsDown, ChevronsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { elementMeta, type ElementGeometry } from "@/components/floorplan/floorPlanElements";

export type ElementPatch = Partial<Pick<ElementGeometry, "label" | "x" | "y" | "width" | "height" | "rotation" | "zIndex">>;

interface ElementPanelProps {
  element: ElementGeometry;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  siblingZIndexes: number[];
  onCommit: (patch: ElementPatch) => void;
  onRemove: () => void;
}

/** Properties of the selected aisle / entrance / stage / label. */
export function ElementPanel({ element, canEdit, canvasWidth, canvasHeight, siblingZIndexes, onCommit, onRemove }: ElementPanelProps) {
  const meta = elementMeta(element.type);
  const Icon = meta.icon;
  const isText = element.type === "label";
  const [text, setText] = useState(element.label ?? "");
  const [form, setForm] = useState({ x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation });

  // Follow the element when it is dragged, nudged or restored by undo.
  useEffect(() => {
    setForm({ x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation });
  }, [element.id, element.x, element.y, element.width, element.height, element.rotation]);
  useEffect(() => {
    setText(element.label ?? "");
  }, [element.id, element.label]);

  function commitText() {
    const next = text.trim();
    if (next === (element.label ?? "")) return;
    if (isText && !next) {
      toast.error("A text label needs some text");
      setText(element.label ?? "");
      return;
    }
    onCommit({ label: next || null });
  }

  function commitGeometry() {
    const width = Math.min(Math.max(1, form.width), canvasWidth);
    const height = Math.min(Math.max(1, form.height), canvasHeight);
    const x = Math.min(Math.max(0, form.x), Math.max(0, canvasWidth - width));
    const y = Math.min(Math.max(0, form.y), Math.max(0, canvasHeight - height));
    const rotation = Math.min(360, Math.max(-360, form.rotation));
    onCommit({ x, y, width, height, rotation });
  }

  const numberField = (key: keyof typeof form, label: string, className?: string) => (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={`element-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`element-${key}`}
        type="number"
        disabled={!canEdit}
        value={Number.isFinite(form[key]) ? form[key] : ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
        onBlur={commitGeometry}
        onKeyDown={(e) => e.key === "Enter" && commitGeometry()}
      />
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        {meta.name}
      </h4>

      <div className="space-y-1">
        <Label htmlFor="element-text" className="text-xs">
          {isText ? "Text" : "Label (optional)"}
        </Label>
        <Input
          id="element-text"
          disabled={!canEdit}
          value={text}
          maxLength={80}
          placeholder={isText ? "e.g. Hall A" : meta.showNameByDefault ? meta.name : "Shown on the plan"}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === "Enter" && commitText()}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {numberField("x", "X")}
        {numberField("y", "Y")}
        {numberField("width", "Width")}
        {numberField("height", "Height")}
        {numberField("rotation", "Rotation", "col-span-2")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Stacking order</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!canEdit}
            onClick={() => onCommit({ zIndex: Math.max(0, ...siblingZIndexes, element.zIndex) + 1 })}
          >
            <ChevronsUp className="w-3.5 h-3.5 mr-1" />
            Front
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!canEdit}
            onClick={() => onCommit({ zIndex: Math.min(0, ...siblingZIndexes, element.zIndex) - 1 })}
          >
            <ChevronsDown className="w-3.5 h-3.5 mr-1" />
            Back
          </Button>
        </div>
      </div>

      {canEdit && (
        <Button variant="destructive" size="sm" className="w-full" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          Remove from plan
        </Button>
      )}
    </div>
  );
}
