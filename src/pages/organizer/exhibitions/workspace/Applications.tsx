import { useOutletContext } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { useExhibitionExhibitors, useReviewApplication } from "@/hooks/organizer/useExhibitionExhibitors";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

export default function Applications() {
  const { exhibition, canManageApplications } = useOutletContext<EventWorkspaceContext>();
  const { data: applications = [] } = useExhibitionExhibitors(exhibition.id);
  const reviewApplication = useReviewApplication(exhibition.id);

  const handleReview = (participantId: string, status: "approved" | "rejected") => {
    reviewApplication.mutate(
      { participantId, status },
      {
        onSuccess: () => toast.success(status === "approved" ? "Application approved" : "Application rejected"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update application"),
      }
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full">
        <thead className="bg-secondary/50">
          <tr>
            <th className="text-left p-4 text-sm font-medium">Business</th>
            <th className="text-left p-4 text-sm font-medium">Status</th>
            <th className="text-left p-4 text-sm font-medium">Stall</th>
            {canManageApplications && <th className="p-4" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((app) => (
            <tr key={app.id} className="hover:bg-secondary/30">
              <td className="p-4 font-medium">{app.business?.companyName ?? "—"}</td>
              <td className="p-4">
                <StatusBadge status={app.status} />
              </td>
              <td className="p-4 text-muted-foreground">
                {app.stalls?.[0]?.code ?? (app.stalls?.[0] ? app.stalls[0].id.slice(0, 6) : "—")}
              </td>
              {canManageApplications && (
                <td className="p-4 text-right">
                  {app.status === "applied" ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleReview(app.id, "approved")}>
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleReview(app.id, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
          {applications.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                No exhibitor applications yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
