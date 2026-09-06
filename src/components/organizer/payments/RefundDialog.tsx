import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  usePaymentDetail,
  useRequestRefund,
  useMockCompleteRefund,
  type RefundReason,
} from "@/hooks/organizer/useOrganizerPayments";

const reasonOptions: { value: RefundReason; label: string }[] = [
  { value: "CUSTOMER_REQUEST", label: "Customer request" },
  { value: "EVENT_CANCELLED", label: "Event cancelled" },
  { value: "DUPLICATE_PAYMENT", label: "Duplicate payment" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
  { value: "OTHER", label: "Other" },
];

export function RefundDialog({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { data, isLoading, refetch } = usePaymentDetail(paymentId);
  const requestRefund = useRequestRefund(paymentId);
  const mockComplete = useMockCompleteRefund(paymentId);

  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<RefundReason>("CUSTOMER_REQUEST");
  const [reasonNote, setReasonNote] = useState("");
  // Generated once per dialog open (not per click) — this is what makes an
  // accidental double-submit a safe replay instead of a second real refund.
  // Real gateway confirmation is asynchronous in general, so the frontend
  // never claims "Refund successful" itself — only the SUCCEEDED state
  // returned by the server (via the mock-complete confirmation step below,
  // in dev/test) does.
  const idempotencyKey = useMemo(() => `ui-${paymentId}-${crypto.randomUUID()}`, [paymentId]);

  const totals = data?.totals;
  const refundable = totals?.refundableAmount ?? 0;

  const handleSubmit = () => {
    if (mode === "partial") {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error("Enter a valid refund amount");
        return;
      }
      if (parsed > refundable) {
        toast.error(`Amount cannot exceed the remaining refundable amount (₹${refundable})`);
        return;
      }
    }
    requestRefund.mutate(
      { amount: mode === "partial" ? Number(amount) : undefined, reason, reasonNote: reasonNote || undefined, idempotencyKey },
      {
        onSuccess: () => {
          toast.success("Refund submitted — awaiting provider confirmation");
          setAmount("");
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Refund request failed");
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <LoadingState label="Loading payment..." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original payment</span>
                <span className="font-medium">₹{totals!.originalAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refunded</span>
                <span className="font-medium">₹{totals!.refundedAmount.toLocaleString("en-IN")}</span>
              </div>
              {totals!.pendingAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending confirmation</span>
                  <span className="font-medium">₹{totals!.pendingAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining refundable</span>
                <span className="font-semibold">₹{refundable.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {refundable <= 0 ? (
              <p className="text-sm text-muted-foreground">This payment has no remaining refundable amount.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button type="button" variant={mode === "full" ? "default" : "outline"} size="sm" onClick={() => setMode("full")}>
                    Full refund
                  </Button>
                  <Button type="button" variant={mode === "partial" ? "default" : "outline"} size="sm" onClick={() => setMode("partial")}>
                    Partial refund
                  </Button>
                </div>

                {mode === "partial" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-amount">Amount (max ₹{refundable.toLocaleString("en-IN")})</Label>
                    <Input
                      id="refund-amount"
                      type="number"
                      min={0.01}
                      max={refundable}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={`Up to ${refundable}`}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Select value={reason} onValueChange={(v) => setReason(v as RefundReason)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="refund-note">Note (optional)</Label>
                  <Textarea id="refund-note" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} rows={2} />
                </div>

                <Button className="w-full" disabled={requestRefund.isPending} onClick={handleSubmit}>
                  {requestRefund.isPending ? "Submitting..." : mode === "full" ? `Refund ₹${refundable.toLocaleString("en-IN")}` : "Submit refund"}
                </Button>
              </>
            )}

            {data.refunds.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium">Refund history</p>
                {data.refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div>₹{Number(r.amount).toLocaleString("en-IN")}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                      {r.failureReason && <div className="text-xs text-destructive">{r.failureReason}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status.toLowerCase()} />
                      {r.status === "PROCESSING" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={mockComplete.isPending}
                            onClick={() => mockComplete.mutate({ refundId: r.id, outcome: "success" })}
                          >
                            Simulate success
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive"
                            disabled={mockComplete.isPending}
                            onClick={() => mockComplete.mutate({ refundId: r.id, outcome: "failure" })}
                          >
                            Simulate failure
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
