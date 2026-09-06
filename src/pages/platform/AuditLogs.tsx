import { useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { usePlatformAuditLogs } from "@/hooks/platform/usePlatformAdmin";

export default function PlatformAuditLogs() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const { data: logs = [], isLoading, isError, refetch } = usePlatformAuditLogs({
    action: action || undefined,
    entityType: entityType || undefined,
  });

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-muted-foreground">Every privileged and cross-cutting action recorded on the platform</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter by action (e.g. platform.organizer_suspended)" className="pl-9" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <Input placeholder="Filter by entity type (e.g. Organizer)" className="sm:w-64" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
      </div>

      {isLoading ? (
        <LoadingState label="Loading audit logs..." />
      ) : isError ? (
        <ErrorState description="Couldn't load audit logs." onRetry={() => refetch()} />
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No matching audit activity" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {logs.map((log) => (
            <div key={log.id} className="p-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{log.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {log.entityType}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                  {log.actorUser ? ` · by ${log.actorUser.fullName ?? log.actorUser.email}` : " · system"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
