import { useOutletContext } from "react-router-dom";
import { useState } from "react";
import { ImagePlus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { FloorPlanEditor } from "@/components/organizer/floorplan/FloorPlanEditor";
import PublishedFloorPlan from "@/components/PublishedFloorPlan";
import { useUploadFloorPlan } from "@/hooks/exhibitor/useExhibitions";
import {
  useFloorPlans,
  useFloorPlan,
  useCreateFloorPlan,
  useUpdateFloorPlan,
} from "@/hooks/organizer/useFloorPlanLayout";
import type { PublicFloorPlan } from "@/hooks/usePublicExhibitions";
import type { Stall } from "@/types/exhibitor";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";
import { resolveAssetUrl } from "@/lib/utils";

async function getFloorPlanCanvasSize(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Unable to read the uploaded floor plan image dimensions."));
      image.src = objectUrl;
    });

    // Keep the editor responsive for very large source images while preserving
    // the uploaded plan's aspect ratio.
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
    return {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Used when the organizer starts without a venue image: a landscape canvas
// that matches the proportions of a typical exhibition hall.
const BLANK_CANVAS = { width: 1600, height: 1000 } as const;

function nextDraftFloorPlanName(existingNames: string[]): string {
  const base = "Main Floor Plan";
  if (!existingNames.includes(base)) return base;

  let index = 2;
  while (existingNames.includes(`${base} - Draft ${index}`)) index += 1;
  return `${base} - Draft ${index}`;
}

export default function FloorPlan() {
  const { exhibition, canManageStalls, canEdit } = useOutletContext<EventWorkspaceContext>();
  const uploadFloorPlan = useUploadFloorPlan(exhibition.id);
  const createFloorPlan = useCreateFloorPlan(exhibition.id);
  const { data: floorPlans, refetch: refetchFloorPlans } = useFloorPlans(exhibition.id);
  const draftFloorPlanId = floorPlans?.find((plan) => plan.status === "draft")?.id ?? "";
  const updateDraftFloorPlan = useUpdateFloorPlan(exhibition.id, draftFloorPlanId);
  const stalls = exhibition.stalls ?? [];
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [preparingEditor, setPreparingEditor] = useState(false);

  const handleFloorPlanUpload = async (file: File) => {
    setPreparingEditor(true);
    try {
      const exhibitionAfterUpload = await uploadFloorPlan.mutateAsync(file);
      const uploadedBackgroundUrl = exhibitionAfterUpload.floorPlanUrl;

      if (!uploadedBackgroundUrl) {
        throw new Error("Floor plan uploaded, but no background URL was returned.");
      }

      // Uploading the image is also the entry point to the structured editor.
      // Reuse an existing draft so an image replacement never destroys mapped
      // stalls. If only a published plan exists, create a new draft instead.
      const latestPlans = (await refetchFloorPlans()).data ?? [];
      const existingDraft = latestPlans.find((plan) => plan.status === "draft");

      if (existingDraft) {
        await updateDraftFloorPlan.mutateAsync({
          expectedVersion: existingDraft.version,
          backgroundUrl: uploadedBackgroundUrl,
        });
      } else {
        const dimensions = await getFloorPlanCanvasSize(file);
        const name = nextDraftFloorPlanName(latestPlans.map((plan) => plan.name));

        await createFloorPlan.mutateAsync({
          name,
          canvasWidth: dimensions.width,
          canvasHeight: dimensions.height,
          backgroundUrl: uploadedBackgroundUrl,
        });
      }

      setTab("editor");
      await refetchFloorPlans();
      toast.success(existingDraft ? "Background updated." : "Floor plan created. Place your stalls next.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to prepare the floor plan editor");
    } finally {
      setPreparingEditor(false);
    }
  };

  const handleStartBlank = () => {
    createFloorPlan.mutate(
      {
        name: "Main Floor Plan",
        canvasWidth: BLANK_CANVAS.width,
        canvasHeight: BLANK_CANVAS.height,
        // An image uploaded earlier for this exhibition is reused rather than ignored.
        backgroundUrl: exhibition.floorPlanUrl || null,
      },
      {
        onSuccess: () => toast.success("Floor plan created. Place your stalls next."),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create the floor plan"),
      }
    );
  };

  // Nothing exists yet: show one clear starting point instead of an empty editor.
  if (floorPlans && floorPlans.length === 0) {
    if (!canEdit) {
      return (
        <EmptyState
          title="No floor plan yet"
          description="The organizer hasn't created a floor plan for this exhibition yet."
        />
      );
    }
    return (
      <StartFloorPlan
        hasStalls={stalls.length > 0}
        hasExistingImage={!!exhibition.floorPlanUrl}
        canUpload={canManageStalls}
        busy={preparingEditor || uploadFloorPlan.isPending || createFloorPlan.isPending}
        uploading={preparingEditor || uploadFloorPlan.isPending}
        onUpload={handleFloorPlanUpload}
        onStartBlank={handleStartBlank}
      />
    );
  }

  const hasDraft = !!draftFloorPlanId;
  const hasPublished = !!floorPlans?.some((plan) => plan.status === "published");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "editor" | "preview")}>
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "editor" ? (
        <FloorPlanEditor
          exhibitionId={exhibition.id}
          stalls={stalls}
          canEdit={canEdit}
          canManageStalls={canManageStalls}
          backgroundUrl={resolveAssetUrl(exhibition.floorPlanUrl)}
          onReplaceBackground={canManageStalls ? handleFloorPlanUpload : undefined}
          replacingBackground={preparingEditor || uploadFloorPlan.isPending}
        />
      ) : (
        <>
          {hasDraft && hasPublished && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm bg-warning/10 text-warning border border-warning/20 rounded-lg p-3">
              <span>You have unpublished draft changes. Exhibitors and visitors still see the published version.</span>
              <Button size="sm" variant="outline" onClick={() => setTab("editor")}>
                Continue editing
              </Button>
            </div>
          )}
          <FloorPlanPreview exhibitionId={exhibition.id} exhibitionName={exhibition.name} stalls={stalls} />
        </>
      )}
    </div>
  );
}

function StartFloorPlan({
  hasStalls,
  hasExistingImage,
  canUpload,
  busy,
  uploading,
  onUpload,
  onStartBlank,
}: {
  hasStalls: boolean;
  hasExistingImage: boolean;
  canUpload: boolean;
  busy: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onStartBlank: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-lg">Create your floor plan</h3>
        <p className="text-sm text-muted-foreground mt-1">
          A floor plan shows exhibitors and visitors where each stall is, and lets approved exhibitors pick their stall on
          the map. It takes three steps: add a background, place your stalls, then publish.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {canUpload && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <ImagePlus className="w-4 h-4 text-primary" />
              Upload a venue image
            </div>
            <p className="text-sm text-muted-foreground">
              Use the venue's floor plan (PNG, JPG or WebP) as the background so stalls line up with the real layout.
            </p>
            <Button asChild disabled={busy}>
              <label className="cursor-pointer">
                {uploading ? "Opening editor..." : "Upload image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
        )}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <Square className="w-4 h-4 text-primary" />
            {hasExistingImage ? "Start from the uploaded image" : "Start with a blank canvas"}
          </div>
          <p className="text-sm text-muted-foreground">
            {hasExistingImage
              ? "Reuse the floor plan image already uploaded for this exhibition."
              : "No venue drawing yet? Lay the stalls out on an empty canvas. You can add a background later."}
          </p>
          <Button variant="outline" onClick={onStartBlank} disabled={busy}>
            {hasExistingImage ? "Use uploaded image" : "Start blank"}
          </Button>
        </div>
      </div>
      {!hasStalls && (
        <p className="text-xs text-warning">
          This exhibition has no stalls yet. You can set up the plan now and place stalls once they are created.
        </p>
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
  const { data: floorPlans, isLoading: plansLoading, isError: plansError, error: plansErrorDetail, refetch: refetchPlans } =
    useFloorPlans(exhibitionId);

  const published = floorPlans?.find((p) => p.status === "published");
  const { data: detail, isLoading: detailLoading, isError: detailError, error: detailErrorDetail } = useFloorPlan(exhibitionId, published?.id);

  if (plansLoading || (published && detailLoading)) return <LoadingState label="Loading floor plan..." />;
  if (plansError || detailError) {
    const error = plansErrorDetail ?? detailErrorDetail;
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

  const stallsById = new Map(stalls.map((s) => [s.id, s]));

  const publicFloorPlan: PublicFloorPlan = {
    id: detail.floorPlan.id,
    exhibitionId,
    name: detail.floorPlan.name,
    backgroundUrl: resolveAssetUrl(detail.floorPlan.backgroundUrl),
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

  return <PublishedFloorPlan floorPlan={publicFloorPlan} exhibitionTitle={exhibitionName} />;
}
