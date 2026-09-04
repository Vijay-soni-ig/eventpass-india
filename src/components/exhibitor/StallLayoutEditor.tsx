import { useState, useCallback, useRef } from "react";
import { Plus, Trash2, Save, ZoomIn, ZoomOut, Upload, Grid3X3, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Stall, StallStatus, StallType } from "@/types/exhibitor";

export interface EditorStall {
  id: string;
  isNew: boolean;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stallType: StallType;
  status: StallStatus;
  buyerName: string | null;
  price: number;
}

interface StallLayoutEditorProps {
  initialStalls?: Stall[];
  onSave?: (stalls: EditorStall[], deletedIds: string[]) => void;
  saving?: boolean;
}

const stallTypes: Record<StallType, { color: string; label: string; basePrice: number }> = {
  premium: { color: "bg-primary/20 border-primary/50", label: "Premium", basePrice: 150000 },
  standard: { color: "bg-accent/20 border-accent/50", label: "Standard", basePrice: 80000 },
  basic: { color: "bg-secondary border-border", label: "Basic", basePrice: 45000 },
};

const statusColors: Record<StallStatus, string> = {
  available: "bg-card border-border hover:border-primary/50",
  reserved: "bg-warning/10 border-warning/30",
  sold: "bg-success/10 border-success/30",
};

function toEditorStalls(stalls: Stall[]): EditorStall[] {
  return stalls.map((s, index) => ({
    id: s.id,
    isNew: false,
    code: s.code ?? `S${String(index + 1).padStart(3, "0")}`,
    x: s.posX != null ? Number(s.posX) : 50 + (index % 4) * 150,
    y: s.posY != null ? Number(s.posY) : 50 + Math.floor(index / 4) * 150,
    width: s.width != null ? Number(s.width) : 100,
    height: s.height != null ? Number(s.height) : 100,
    stallType: (s.stallType as StallType) ?? "standard",
    status: s.status,
    buyerName: s.buyerName ?? null,
    price: Number(s.price),
  }));
}

export function StallLayoutEditor({ initialStalls = [], onSave, saving }: StallLayoutEditorProps) {
  const [stalls, setStalls] = useState<EditorStall[]>(toEditorStalls(initialStalls));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [selectedStall, setSelectedStall] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [floorPlanImage, setFloorPlanImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const newIdCounter = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent, stallId: string, action: "drag" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedStall(stallId);
    setDragStart({ x: e.clientX, y: e.clientY });
    if (action === "drag") {
      setIsDragging(true);
    } else {
      setIsResizing(true);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!selectedStall || (!isDragging && !isResizing)) return;

      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      setStalls((prev) =>
        prev.map((stall) => {
          if (stall.id !== selectedStall) return stall;

          if (isDragging) {
            return {
              ...stall,
              x: Math.max(0, stall.x + dx),
              y: Math.max(0, stall.y + dy),
            };
          } else if (isResizing) {
            return {
              ...stall,
              width: Math.max(60, stall.width + dx),
              height: Math.max(60, stall.height + dy),
            };
          }
          return stall;
        })
      );

      setDragStart({ x: e.clientX, y: e.clientY });
    },
    [selectedStall, isDragging, isResizing, dragStart, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  const addStall = (type: StallType) => {
    newIdCounter.current += 1;
    const newId = `new-${newIdCounter.current}`;
    const sizes: Record<StallType, number> = { premium: 120, standard: 100, basic: 80 };
    const newStall: EditorStall = {
      id: newId,
      isNew: true,
      code: `NEW-${newIdCounter.current}`,
      x: 50 + (stalls.length % 4) * 150,
      y: 50 + Math.floor(stalls.length / 4) * 150,
      width: sizes[type],
      height: sizes[type],
      stallType: type,
      status: "available",
      buyerName: null,
      price: stallTypes[type].basePrice,
    };
    setStalls([...stalls, newStall]);
    toast.success(`Added ${type} stall ${newStall.code}`);
  };

  const deleteStall = (stallId: string) => {
    const stall = stalls.find((s) => s.id === stallId);
    if (stall?.status === "sold") {
      toast.error("Cannot delete a sold stall. This affects contracts.");
      return;
    }
    setStalls(stalls.filter((s) => s.id !== stallId));
    if (stall && !stall.isNew) {
      setDeletedIds((prev) => [...prev, stallId]);
    }
    setSelectedStall(null);
    toast.success("Stall removed");
  };

  const updateStall = (stallId: string, updates: Partial<EditorStall>) => {
    setStalls((prev) => prev.map((s) => (s.id === stallId ? { ...s, ...updates } : s)));
  };

  const assignBuyer = (stallId: string, buyer: string, status: "reserved" | "sold") => {
    updateStall(stallId, { buyerName: buyer, status });
    setShowAssignModal(false);
    toast.success(`Stall assigned to ${buyer}`);
  };

  const handleSave = () => {
    onSave?.(stalls, deletedIds);
  };

  const handleFloorPlanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFloorPlanImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const autoArrangeStalls = () => {
    const canvasWidth = 800;
    const canvasHeight = 600;
    const padding = 30;
    const gap = 20;

    if (stalls.length === 0) {
      toast.info("No stalls to arrange. Add some stalls first.");
      return;
    }

    const stallCount = stalls.length;
    const cols = Math.ceil(Math.sqrt(stallCount));
    const rows = Math.ceil(stallCount / cols);

    const availableWidth = canvasWidth - padding * 2 - gap * (cols - 1);
    const availableHeight = canvasHeight - padding * 2 - gap * (rows - 1);

    const stallWidth = Math.floor(availableWidth / cols);
    const stallHeight = Math.floor(availableHeight / rows);

    const minSize = 60;
    const finalWidth = Math.max(minSize, Math.min(stallWidth, 150));
    const finalHeight = Math.max(minSize, Math.min(stallHeight, 150));

    const arrangedStalls = stalls.map((stall, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      return {
        ...stall,
        x: padding + col * (finalWidth + gap),
        y: padding + row * (finalHeight + gap),
        width: finalWidth,
        height: finalHeight,
      };
    });

    setStalls(arrangedStalls);
    toast.success(`Auto-arranged ${stallCount} stalls in a ${cols}x${rows} grid`);
  };

  const selectedStallData = stalls.find((s) => s.id === selectedStall);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => addStall("premium")}>
            <Plus className="w-4 h-4 mr-1" />
            Premium
          </Button>
          <Button variant="outline" size="sm" onClick={() => addStall("standard")}>
            <Plus className="w-4 h-4 mr-1" />
            Standard
          </Button>
          <Button variant="outline" size="sm" onClick={() => addStall("basic")}>
            <Plus className="w-4 h-4 mr-1" />
            Basic
          </Button>
          <Button variant="outline" size="sm" onClick={autoArrangeStalls}>
            <Grid3X3 className="w-4 h-4 mr-1" />
            Auto-arrange
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="floorplan" className="cursor-pointer">
            <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-secondary transition-colors">
              <Upload className="w-4 h-4" />
              <span className="text-sm">Preview Floor Plan</span>
            </div>
            <Input id="floorplan" type="file" accept="image/*" className="hidden" onChange={handleFloorPlanUpload} />
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Layout"}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 bg-card border border-border rounded-xl overflow-auto"
          style={{ height: "600px" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="relative min-h-full min-w-full"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              backgroundImage: floorPlanImage
                ? `url(${floorPlanImage})`
                : "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: floorPlanImage ? "cover" : "20px 20px",
              width: "800px",
              height: "600px",
            }}
            onClick={() => setSelectedStall(null)}
          >
            {stalls.map((stall) => (
              <div
                key={stall.id}
                className={cn(
                  "absolute border-2 rounded-lg cursor-move transition-shadow flex flex-col items-center justify-center",
                  statusColors[stall.status],
                  selectedStall === stall.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
                style={{
                  left: stall.x,
                  top: stall.y,
                  width: stall.width,
                  height: stall.height,
                }}
                onMouseDown={(e) => handleMouseDown(e, stall.id, "drag")}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStall(stall.id);
                }}
              >
                <span className="font-mono font-bold text-sm">{stall.code}</span>
                <span className="text-xs text-muted-foreground capitalize">{stall.stallType}</span>
                {stall.buyerName && (
                  <span className="text-xs font-medium mt-1 truncate max-w-full px-2">{stall.buyerName}</span>
                )}

                {/* Resize handle */}
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-primary/20 rounded-tl"
                  onMouseDown={(e) => handleMouseDown(e, stall.id, "resize")}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-full lg:w-72 bg-card border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-primary" />
            Stall Properties
          </h3>

          {selectedStallData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stall Code</Label>
                <Input
                  value={selectedStallData.code}
                  onChange={(e) => updateStall(selectedStallData.id, { code: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={selectedStallData.stallType}
                  onValueChange={(v) =>
                    updateStall(selectedStallData.id, {
                      stallType: v as StallType,
                      price: stallTypes[v as StallType].basePrice,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Width (px)</Label>
                  <Input
                    type="number"
                    value={selectedStallData.width}
                    onChange={(e) => updateStall(selectedStallData.id, { width: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Height (px)</Label>
                  <Input
                    type="number"
                    value={selectedStallData.height}
                    onChange={(e) => updateStall(selectedStallData.id, { height: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input
                  type="number"
                  value={selectedStallData.price}
                  onChange={(e) => updateStall(selectedStallData.id, { price: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedStallData.status} />
                  {selectedStallData.buyerName && (
                    <span className="text-sm text-muted-foreground">({selectedStallData.buyerName})</span>
                  )}
                </div>
              </div>

              <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <User className="w-4 h-4 mr-2" />
                    Assign Buyer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Buyer to {selectedStallData.code}</DialogTitle>
                  </DialogHeader>
                  <AssignBuyerForm
                    onAssign={(buyer, status) => assignBuyer(selectedStallData.id, buyer, status)}
                    onCancel={() => setShowAssignModal(false)}
                  />
                </DialogContent>
              </Dialog>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => deleteStall(selectedStallData.id)}
                disabled={selectedStallData.status === "sold"}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Stall
              </Button>

              {selectedStallData.status === "sold" && (
                <p className="text-xs text-warning text-center">⚠️ Deleting sold stalls affects contracts</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Select a stall to edit its properties</p>
          )}

          {/* Legend */}
          <div className="pt-4 border-t border-border space-y-2">
            <p className="text-sm font-medium">Legend</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-card border border-border" />
                <span className="text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-warning/10 border border-warning/30" />
                <span className="text-muted-foreground">Reserved</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-success/10 border border-success/30" />
                <span className="text-muted-foreground">Sold</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignBuyerForm({
  onAssign,
  onCancel,
}: {
  onAssign: (buyer: string, status: "reserved" | "sold") => void;
  onCancel: () => void;
}) {
  const [buyer, setBuyer] = useState("");
  const [status, setStatus] = useState<"reserved" | "sold">("reserved");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Buyer Name / Company</Label>
        <Input placeholder="Enter buyer name" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as "reserved" | "sold")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onAssign(buyer, status)} disabled={!buyer.trim()}>
          Assign
        </Button>
      </div>
    </div>
  );
}
