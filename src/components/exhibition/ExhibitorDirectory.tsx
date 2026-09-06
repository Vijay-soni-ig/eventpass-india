import { useMemo, useState } from "react";
import { Search, Store, BadgeCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { usePublicExhibitionExhibitors } from "@/hooks/usePublicExhibitions";

// Phase 24 — public exhibitor directory. Only `status: "confirmed"`
// participations are ever returned by the backing endpoint (see
// GET /api/public/exhibitions/:id/exhibitors), so an "applied but not yet
// approved" or "cancelled" exhibitor can never appear here — tenant
// isolation and participation-status filtering are both enforced server-
// side, this component only presents what the API already scoped down.
export function ExhibitorDirectory({ exhibitionId }: { exhibitionId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, refetch } = usePublicExhibitionExhibitors(exhibitionId, page);

  const filtered = useMemo(() => {
    const exhibitors = data?.exhibitors ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return exhibitors;
    return exhibitors.filter(
      (e) =>
        e.business.companyName?.toLowerCase().includes(q) ||
        e.business.businessType?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exhibitors</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState label="Loading exhibitors..." />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exhibitors</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState title="Couldn't load exhibitors" onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  // No confirmed exhibitors at all (not even before filtering) — hide the
  // whole section rather than showing an empty directory for an event that
  // simply has no exhibitors yet, per "do not show empty sections".
  if (!data || data.total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exhibitors ({data.total})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search exhibitors by name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Store} title="No exhibitors match your search" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((exhibitor) => (
              <div
                key={exhibitor.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border"
              >
                <Avatar className="w-10 h-10 border border-border shrink-0">
                  <AvatarImage src={exhibitor.business.logoUrl ?? undefined} alt={exhibitor.business.companyName ?? ""} />
                  <AvatarFallback>{(exhibitor.business.companyName ?? "?").charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate flex items-center gap-1">
                    {exhibitor.business.companyName ?? "Unnamed exhibitor"}
                    {exhibitor.business.kycStatus === "verified" && (
                      <BadgeCheck className="w-3.5 h-3.5 text-success shrink-0" aria-label="Verified exhibitor" />
                    )}
                  </p>
                  {exhibitor.business.businessType && (
                    <p className="text-xs text-muted-foreground truncate">{exhibitor.business.businessType}</p>
                  )}
                  {exhibitor.boothNumber && (
                    <Badge variant="outline" className="mt-1.5 text-xs">
                      Booth {exhibitor.boothNumber}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
