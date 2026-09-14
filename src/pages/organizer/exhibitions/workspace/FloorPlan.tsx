import { useOutletContext } from "react-router-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FloorPlanEditor } from "@/components/organizer/floorplan/FloorPlanEditor";
import { useUploadFloorPlan } from "@/hooks/exhibitor/useExhibitions";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

export default function FloorPlan() {
  const { exhibition, canManageStalls, canEdit } = useOutletContext<EventWorkspaceContext>();
  const uploadFloorPlan = useUploadFloorPlan(exhibition.id);
  const stalls = exhibition.stalls ?? [];

  const handleFloorPlanUpload = (file: File) => {
    uploadFloorPlan.mutate(file, {
      onSuccess: () => toast.success("Floor plan uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload floor plan"),
    });
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

      <FloorPlanEditor exhibitionId={exhibition.id} stalls={stalls} canEdit={canEdit} />
    </div>
  );
}
