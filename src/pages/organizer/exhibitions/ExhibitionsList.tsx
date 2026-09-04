import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Filter, Calendar, MapPin, MoreHorizontal, Eye, Edit, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useExhibitions, useDeleteExhibition, useDuplicateExhibition } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useStallBookings } from "@/hooks/exhibitor/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";

export default function ExhibitionsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = hasOrganizerPermission(user?.roles, "exhibition:create");
  const canDelete = hasOrganizerPermission(user?.roles, "exhibition:delete");

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: exhibitions = [], isLoading, isError, refetch } = useExhibitions();
  const { data: ticketBookings = [] } = useTicketBookings();
  const { data: stallBookings = [] } = useStallBookings();
  const deleteExhibition = useDeleteExhibition();
  const duplicateExhibition = useDuplicateExhibition();

  const filteredExhibitions = exhibitions.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatCurrency = (amount: number) => `₹${(amount / 100000).toFixed(1)}L`;

  const revenueFor = (exhibitionId: string) => {
    const ticketRevenue = ticketBookings
      .filter((b) => b.exhibitionId === exhibitionId)
      .reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
    const stallRevenue = stallBookings
      .filter((b) => b.exhibitionId === exhibitionId)
      .reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
    return ticketRevenue + stallRevenue;
  };

  const ticketsSoldFor = (exhibitionId: string) =>
    ticketBookings.filter((b) => b.exhibitionId === exhibitionId).reduce((sum, b) => sum + b.quantity, 0);

  const handleDuplicate = (id: string) => {
    duplicateExhibition.mutate(id, {
      onSuccess: () => toast.success("Exhibition duplicated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to duplicate exhibition"),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteExhibition.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Exhibition deleted");
        setDeleteId(null);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to delete exhibition");
        setDeleteId(null);
      },
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Exhibitions</h1>
          <p className="text-muted-foreground">Manage every exhibition your organization runs</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/organizer/exhibitions/new">
              <Plus className="w-4 h-4 mr-2" />
              Create Exhibition
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search exhibitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading exhibitions..." />
      ) : isError ? (
        <ErrorState description="Couldn't load your exhibitions." onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4">
          {filteredExhibitions.map((exhibition) => {
            const stallsTotal = exhibition.stalls?.length ?? 0;
            const stallsOccupied = exhibition.stalls?.filter((s) => s.status === "sold").length ?? 0;
            const ticketsSold = ticketsSoldFor(exhibition.id);
            return (
              <div
                key={exhibition.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <Link
                          to={`/organizer/exhibitions/${exhibition.id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          {exhibition.name}
                        </Link>
                        <StatusBadge status={exhibition.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {exhibition.city}
                        </span>
                        {exhibition.startDate && exhibition.endDate && (
                          <>
                            <span>•</span>
                            <span>
                              {new Date(exhibition.startDate).toLocaleDateString()} -{" "}
                              {new Date(exhibition.endDate).toLocaleDateString()}
                            </span>
                          </>
                        )}
                        {exhibition.category && (
                          <>
                            <span>•</span>
                            <span className="text-primary font-medium">{exhibition.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 lg:gap-8">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{ticketsSold.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Tickets</p>
                    </div>
                    <div className="min-w-[100px]">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Stalls</span>
                        <span className="text-muted-foreground">
                          {stallsOccupied}/{stallsTotal}
                        </span>
                      </div>
                      <Progress value={stallsTotal > 0 ? (stallsOccupied / stallsTotal) * 100 : 0} className="h-2" />
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary">{formatCurrency(revenueFor(exhibition.id))}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-5 h-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/organizer/exhibitions/${exhibition.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {canCreate && (
                          <DropdownMenuItem onClick={() => navigate(`/organizer/exhibitions/${exhibition.id}`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canCreate && (
                          <DropdownMenuItem onClick={() => handleDuplicate(exhibition.id)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(exhibition.id)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredExhibitions.length === 0 && (
            <EmptyState
              icon={Calendar}
              title="No exhibitions found"
              description={
                exhibitions.length === 0
                  ? "Create your first exhibition to get started."
                  : "Try adjusting your search or filters."
              }
              action={
                canCreate && exhibitions.length === 0 ? (
                  <Button asChild>
                    <Link to="/organizer/exhibitions/new">Create your first exhibition</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exhibition?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the exhibition and all associated ticket types and stalls. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
