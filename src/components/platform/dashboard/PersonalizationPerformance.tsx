import { MousePointerClick, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlatformPersonalizationAnalytics } from "@/hooks/platform/usePlatformAdmin";

export function PersonalizationPerformance({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError } = usePlatformPersonalizationAnalytics({ from, to });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" /> Personalization Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading personalization metrics...</p>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">Personalization metrics are unavailable.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Metric icon={<Sparkles className="w-4 h-4" aria-hidden="true" />} label="Impressions" value={data.recommendation.impressions} />
            <Metric icon={<MousePointerClick className="w-4 h-4" aria-hidden="true" />} label="Clicks" value={data.recommendation.clicks} />
            <Metric icon={<Users className="w-4 h-4" aria-hidden="true" />} label="Unique visitors" value={data.uniqueVisitors} />
            <div className="col-span-3 pt-2 border-t">
              <p className="text-xs text-muted-foreground">Recommendation CTR</p>
              <p className="text-xl font-semibold">{(data.recommendation.ctr * 100).toFixed(2)}%</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-lg font-semibold mt-1">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}
