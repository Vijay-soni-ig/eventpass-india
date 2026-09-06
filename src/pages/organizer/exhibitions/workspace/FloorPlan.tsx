import { useOutletContext } from "react-router-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { StallLayoutEditor, type EditorStall } from "@/components/exhibitor/StallLayoutEditor";
import {
  useUploadFloorPlan,
  useCreateStall,
  useUpdateStall,
  useDeleteStall,
} from "@/hooks/exhibitor/useExhibitions";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

export default function FloorPlan() {
  const { exhibition, canManageStalls } = useOutletContext<EventWorkspaceContext>();
  const uploadFloorPlan = useUploadFloorPlan(exhibition.id);
  const createStall = useCreateStall(exhibition.id);
  const updateStall = useUpdateStall(exhibition.id);
  const deleteStall = useDeleteStall(exhibition.id);
  const stalls = exhibition.stalls ?? [];

  const handleFloorPlanUpload = (file: File) => {
    uploadFloorPlan.mutate(file, {
      onSuccess: () => toast.success("Floor plan uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload floor plan"),
    });
  };

  const handleSaveStalls = async (editedStalls: EditorStall[], deletedIds: string[]) => {
    try {
      await Promise.all([
        ...deletedIds.map((sid) => deleteStall.mutateAsync(sid)),
        ...editedStalls.map(async (stall) => {
          if (stall.isNew) {
            const created = await createStall.mutateAsync({
              code: stall.code,
              stallType: stall.stallType,
              price: stall.price,
              posX: stall.x,
              posY: stall.y,
              width: stall.width,
              height: stall.height,
            });
            if (stall.status !== "available" || stall.buyerName) {
              await updateStall.mutateAsync({ id: created.id, status: stall.status, buyerName: stall.buyerName });
            }
          } else {
            await updateStall.mutateAsync({
              id: stall.id,
              code: stall.code,
              stallType: stall.stallType,
              price: stall.price,
              posX: stall.x,
              posY: stall.y,
              width: stall.width,
              height: stall.height,
              status: stall.status,
              buyerName: stall.buyerName,
            });
          }
        }),
      ]);
      toast.success("Stall layout saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save stall layout");
    }
  };

  return (
    <div className="space-y-4">
      {canManageStalls && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <h3 className="font-semibold">Floor Plan Image</h3>
          <p className="text-sm text-muted-foreground">
            Upload a background image of the venue floor plan to help place stalls accurately.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild disabled={uploadFloorPlan.isPending}>
              <label className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                {uploadFloorPlan.isPending ? "Uploading..." : "Upload Floor Plan"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFloorPlanUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
            {exhibition.floorPlanUrl && <span className="text-sm text-success">Floor plan uploaded</span>}
          </div>
        </div>
      )}

      {canManageStalls ? (
        <StallLayoutEditor
          initialStalls={stalls}
          onSave={handleSaveStalls}
          saving={createStall.isPending || updateStall.isPending || deleteStall.isPending}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stalls.map((stall) => (
            <div key={stall.id} className="rounded-lg p-4 border-2 border-border">
              <p className="font-mono font-semibold mb-1">{stall.code ?? stall.id.slice(0, 6)}</p>
              <p className="text-xs text-muted-foreground">{stall.stallType}</p>
              <StatusBadge status={stall.status} className="mt-2" />
            </div>
          ))}
          {stalls.length === 0 && (
            <div className="col-span-full">
              <EmptyState title="No stalls configured yet." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
