import { useOutletContext } from "react-router-dom";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { FloorPlanEditor } from "@/components/organizer/floorplan/FloorPlanEditor";
import PublishedFloorPlan from "@/components/PublishedFloorPlan";
import { useUploadFloorPlan } from "@/hooks/exhibitor/useExhibitions";
import { useFloorPlans, useFloorPlan } from "@/hooks/organizer/useFloorPlanLayout";
import type { PublicFloorPlan } from "@/hooks/usePublicExhibitions";
import type { Stall } from "@/types/exhibitor";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

export default function FloorPlan() {
  const { exhibition, canManageStalls, canEdit } = useOutletContext<EventWorkspaceContext>();
  const uploadFloorPlan = useUploadFloorPlan(exhibition.id);
  const stalls = exhibition.stalls ?? [];
  const [tab, setTab] = useState<"editor" | "preview">("editor");

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "editor" | "preview")}>
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "editor" ? (
        <FloorPlanEditor exhibitionId={exhibition.id} stalls={stalls} canEdit={canEdit} />
      ) : (
        <FloorPlanPreview exhibitionId={exhibition.id} exhibitionName={exhibition.name} stalls={stalls} />
      )}
    </div>
  );
}

/**
 * Read-only "what exhibitors and visitors actually see" view for the
 * organizer, reusing PublishedFloorPlan.tsx (same component the public
 * exhibition page and the exhibitor's own map picker render) rather than
 * building a third rendering of the same canvas. No `onApply` is passed,
 * so PublishedFloorPlan's existing `onApply ? ... : ...` branch already
 * renders its non-interactive message instead of an apply CTA — exactly
 * the "read-only" framing this organizer context needs.
 */
function FloorPlanPreview({
  exhibitionId,
  exhibitionName,
  stalls,
}: {
  exhibitionId: string;
  exhibitionName: string;
  stalls: Stall[];
}) {
  const { data: floorPlans, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } =
    useFloorPlans(exhibitionId);

  const published = floorPlans?.find((p) => p.status === "published");
  const { data: detail, isLoading: detailLoading, isError: detailError } = useFloorPlan(exhibitionId, published?.id);

  if (plansLoading || (published && detailLoading)) return <LoadingState label="Loading floor plan..." />;
  if (plansError || detailError) {
    const error = plansError ?? detailError;
    const message = error instanceof Error ? error.message : "The published floor plan could not be loaded.";
    return (
      <ErrorState
        title="Failed to load floor plan"
        description={message}
        onRetry={() => refetchPlans()}
      />
    );
  }

  if (!published || !detail) {
    return (
      <EmptyState
        title="Nothing published yet"
        description="Publish a floor plan from the Editor tab so exhibitors and visitors can see it here."
      />
    );
  }

  // A draft exists alongside the published plan if either another plan
  // record is present, or the published plan itself has been edited
  // (updatedAt later than publishedAt) without being republished since.
  const draft =
    floorPlans?.find((p) => p.id !== published.id) ??
    (published.publishedAt && new Date(published.updatedAt) > new Date(published.publishedAt) ? published : undefined);

  const stallsById = new Map(stalls.map((s) => [s.id, s]));

  const publicFloorPlan: PublicFloorPlan = {
    id: detail.floorPlan.id,
    exhibitionId,
    name: detail.floorPlan.name,
    backgroundUrl: detail.floorPlan.backgroundUrl,
    canvasWidth: detail.floorPlan.canvasWidth,
    canvasHeight: detail.floorPlan.canvasHeight,
    publishedAt: detail.floorPlan.publishedAt,
    objects: detail.objects
      .map((object) => {
        const stall = stallsById.get(object.stallId);
        if (!stall) return null;
        return {
          id: object.id,
          stallId: object.stallId,
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
          rotation: object.rotation,
          zIndex: object.zIndex,
          labelVisible: object.labelVisible,
          stall: { id: stall.id, code: stall.code, stallType: stall.stallType, price: stall.price, status: stall.status },
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null),
  };

  return (
    <div className="space-y-4">
      {draft && (
        <div className="text-sm bg-warning/10 text-warning border border-warning/20 rounded-lg p-3">
          You have unpublished draft changes — exhibitors and visitors still see the version published on{" "}
          {published.publishedAt ? new Date(published.publishedAt).toLocaleDateString() : "an earlier date"}.
        </div>
      )}
      <PublishedFloorPlan floorPlan={publicFloorPlan} exhibitionTitle={exhibitionName} />
    </div>
  );
}
