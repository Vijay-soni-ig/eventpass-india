import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StallLayoutEditor, type EditorStall } from "@/components/exhibitor/StallLayoutEditor";
import { useExhibition, useCreateStall, useUpdateStall, useDeleteStall } from "@/hooks/exhibitor/useExhibitions";

export default function StallEditor() {
  const { exhibitionId } = useParams();
  const navigate = useNavigate();
  const { data: exhibition, isLoading, isError } = useExhibition(exhibitionId);
  const createStall = useCreateStall(exhibitionId ?? "");
  const updateStall = useUpdateStall(exhibitionId ?? "");
  const deleteStall = useDeleteStall(exhibitionId ?? "");

  const handleSave = async (stalls: EditorStall[], deletedIds: string[]) => {
    try {
      await Promise.all([
        ...deletedIds.map((id) => deleteStall.mutateAsync(id)),
        ...stalls.map(async (stall) => {
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
              await updateStall.mutateAsync({
                id: created.id,
                status: stall.status,
                buyerName: stall.buyerName,
              });
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
      toast.success("Layout saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save layout");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isError || !exhibition) {
    return (
      <div className="text-center py-24 space-y-4">
        <h2 className="text-xl font-semibold">Exhibition not found</h2>
        <Button onClick={() => navigate("/exhibitor-dashboard/stalls")}>Back to Stalls</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/exhibitor-dashboard/stalls">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Stall Layout Editor</h1>
          <p className="text-muted-foreground">{exhibition.name} — design and manage your exhibition floor plan</p>
        </div>
      </div>

      <StallLayoutEditor
        initialStalls={exhibition.stalls ?? []}
        onSave={handleSave}
        saving={createStall.isPending || updateStall.isPending || deleteStall.isPending}
      />
    </div>
  );
}
