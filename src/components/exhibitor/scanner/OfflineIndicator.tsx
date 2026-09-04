import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/exhibitor/use-offline-sync";

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount, forceSync, lastSyncTime } = useOfflineSync();

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
        isOnline ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
      }`}
    >
      <div className="flex items-center gap-2">
        {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        <span className="text-sm font-medium">{isOnline ? "Online" : "Offline"}</span>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <CloudOff className="w-4 h-4" />
          <span className="text-xs">{pendingCount} pending</span>
          {isOnline && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={forceSync} disabled={isSyncing}>
              <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      )}

      {pendingCount === 0 && isOnline && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cloud className="w-4 h-4" />
          <span className="text-xs">Synced</span>
        </div>
      )}

      {lastSyncTime && (
        <span className="text-xs text-muted-foreground ml-auto">Last sync: {lastSyncTime.toLocaleTimeString()}</span>
      )}
    </div>
  );
}
