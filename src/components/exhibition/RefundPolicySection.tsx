import { ShieldCheck } from "lucide-react";

// Phase 24 — renders `Exhibition.refundPolicy`/`terms`, columns that already
// exist and are already returned by GET /api/public/exhibitions/:id but were
// never surfaced anywhere in the UI. No policy text is invented here — if an
// organizer never set these fields, the section renders nothing at all.
export function RefundPolicySection({ refundPolicy, terms }: { refundPolicy: string | null; terms: string | null }) {
  if (!refundPolicy && !terms) return null;
  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
        Policies
      </h2>
      <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
        {refundPolicy && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Refund &amp; Cancellation</h3>
            <p className="text-muted-foreground text-sm whitespace-pre-line leading-relaxed">{refundPolicy}</p>
          </div>
        )}
        {terms && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Terms</h3>
            <p className="text-muted-foreground text-sm whitespace-pre-line leading-relaxed">{terms}</p>
          </div>
        )}
      </div>
    </div>
  );
}
