import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { blockLayout, blockOrigin, type Box } from "./floorPlanGeometry";
import type { GenerateStallsInput } from "@/hooks/organizer/useFloorPlanLayout";

export type GenerateStallsValues = Omit<GenerateStallsInput, "expectedVersion">;

interface GenerateStallsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everything already on the canvas, so the new block starts below it. */
  existing: Box[];
  existingCodes: string[];
  canvasWidth: number;
  canvasHeight: number;
  pending: boolean;
  onSubmit: (values: GenerateStallsValues) => void;
}

const MAX_COUNT = 200;

function toInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function codeFor(prefix: string, start: number, padding: number, index: number): string {
  return `${prefix}${String(start + index).padStart(padding, "0")}`;
}

export function GenerateStallsDialog({
  open,
  onOpenChange,
  existing,
  existingCodes,
  canvasWidth,
  canvasHeight,
  pending,
  onSubmit,
}: GenerateStallsDialogProps) {
  const [prefix, setPrefix] = useState("A-");
  const [start, setStart] = useState("1");
  const [count, setCount] = useState("10");
  const [columns, setColumns] = useState("5");
  const [padding, setPadding] = useState("2");
  const [stallType, setStallType] = useState<GenerateStallsInput["stallType"]>("standard");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [width, setWidth] = useState("80");
  const [height, setHeight] = useState("60");
  const [gap, setGap] = useState("10");

  const parsed = useMemo(
    () => ({
      prefix: prefix.trim(),
      start: toInt(start, NaN),
      count: toInt(count, NaN),
      columns: toInt(columns, NaN),
      padding: toInt(padding, NaN),
      price: price.trim() === "" ? NaN : Number(price),
      width: Number(width),
      height: Number(height),
      gap: Number(gap),
    }),
    [prefix, start, count, columns, padding, price, width, height, gap]
  );

  const origin = useMemo(() => blockOrigin(existing), [existing]);

  const problem = useMemo(() => {
    const p = parsed;
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > MAX_COUNT) return `Enter a stall count from 1 to ${MAX_COUNT}.`;
    if (!Number.isInteger(p.start) || p.start < 0) return "The starting number must be 0 or more.";
    if (!Number.isInteger(p.padding) || p.padding < 0 || p.padding > 5) return "Digits must be between 0 and 5.";
    if (p.prefix.length > 10) return "The prefix can be at most 10 characters.";
    if (!Number.isInteger(p.columns) || p.columns < 1) return "Enter how many stalls per row.";
    if (!Number.isFinite(p.price) || p.price < 0) return "Enter a price (0 or more).";
    if (!(p.width > 0) || !(p.height > 0) || !Number.isFinite(p.width) || !Number.isFinite(p.height)) return "Stall width and height must be more than 0.";
    if (!(p.gap >= 0) || !Number.isFinite(p.gap)) return "The gap cannot be negative.";
    const layout = blockLayout(p.count, p.columns, p.width, p.height, p.gap, origin, canvasWidth, canvasHeight);
    if (!layout.fits) {
      return `This block needs ${Math.round(layout.totalWidth)} × ${Math.round(layout.totalHeight)} px but only ${Math.round(
        canvasWidth - origin.x
      )} × ${Math.round(canvasHeight - origin.y)} px is free. Use fewer stalls, more per row, or smaller stalls.`;
    }
    const taken = new Set(existingCodes.map((c) => c.trim().toLowerCase()));
    for (let i = 0; i < p.count; i += 1) {
      const code = codeFor(p.prefix, p.start, p.padding, i);
      if (taken.has(code.toLowerCase())) return `A stall with the code "${code}" already exists. Change the prefix or starting number.`;
    }
    return null;
  }, [parsed, origin, canvasWidth, canvasHeight, existingCodes]);

  const preview =
    Number.isInteger(parsed.count) && parsed.count >= 1 && Number.isInteger(parsed.start) && Number.isInteger(parsed.padding) && parsed.padding >= 0
      ? parsed.count === 1
        ? codeFor(parsed.prefix, parsed.start, parsed.padding, 0)
        : `${codeFor(parsed.prefix, parsed.start, parsed.padding, 0)} to ${codeFor(parsed.prefix, parsed.start, parsed.padding, parsed.count - 1)}`
      : "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (problem || pending) return;
    onSubmit({
      prefix: parsed.prefix,
      startNumber: parsed.start,
      padding: parsed.padding,
      count: parsed.count,
      stallType,
      size: size.trim() || undefined,
      price: parsed.price,
      x: origin.x,
      y: origin.y,
      width: parsed.width,
      height: parsed.height,
      columns: Math.min(parsed.columns, parsed.count),
      gap: parsed.gap,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Generate stalls</DialogTitle>
            <DialogDescription>
              Create a block of new stalls and place them on this plan in one step. They are added below your existing stalls, ready to
              drag into position.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-prefix">Code prefix</Label>
              <Input id="gen-prefix" value={prefix} maxLength={10} onChange={(e) => setPrefix(e.target.value)} placeholder="A-" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-start">Starting number</Label>
              <Input id="gen-start" type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-count">How many stalls</Label>
              <Input id="gen-count" type="number" min={1} max={MAX_COUNT} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-columns">Stalls per row</Label>
              <Input id="gen-columns" type="number" min={1} value={columns} onChange={(e) => setColumns(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-type">Type</Label>
              <Select value={stallType} onValueChange={(v) => setStallType(v as GenerateStallsInput["stallType"])}>
                <SelectTrigger id="gen-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-price">Price per stall (₹)</Label>
              <Input id="gen-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 15000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-size">Size label (optional)</Label>
              <Input id="gen-size" value={size} maxLength={40} onChange={(e) => setSize(e.target.value)} placeholder="3x3 m" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-padding">Digits in number</Label>
              <Input id="gen-padding" type="number" min={0} max={5} value={padding} onChange={(e) => setPadding(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-width">Map width</Label>
              <Input id="gen-width" type="number" min={1} value={width} onChange={(e) => setWidth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-height">Map height</Label>
              <Input id="gen-height" type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-gap">Gap</Label>
              <Input id="gen-gap" type="number" min={0} value={gap} onChange={(e) => setGap(e.target.value)} />
            </div>
          </div>

          {preview && !problem && (
            <p className="text-sm text-muted-foreground" data-testid="generate-preview">
              Will create <span className="font-medium text-foreground">{parsed.count}</span> {parsed.count === 1 ? "stall" : "stalls"}:{" "}
              <span className="font-mono text-foreground">{preview}</span>
            </p>
          )}
          {problem && (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!problem || pending}>
              {pending ? "Creating..." : `Create ${Number.isInteger(parsed.count) && parsed.count > 0 ? parsed.count : ""} stalls`.replace("  ", " ")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
