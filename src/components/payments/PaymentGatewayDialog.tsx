import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ShieldCheck, FlaskConical } from "lucide-react";
import { useVerifyPayment, useMockCompletePayment, type Payment, type PaymentOrder } from "@/hooks/usePayments";
import { toast } from "sonner";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface PaymentGatewayDialogProps {
  open: boolean;
  onClose: () => void;
  payment: Payment;
  order: PaymentOrder;
  onSettled: (status: Payment["status"]) => void;
}

/**
 * Opens the real Razorpay checkout widget when a public key is configured;
 * otherwise renders a clearly-labeled mock gateway screen. Either way, the
 * dialog never marks the payment successful itself — it only ever triggers
 * a server call (checkout-signature verify, or the mock-provider's own
 * simulated decision) and reflects back whatever status the server
 * actually recorded.
 */
export function PaymentGatewayDialog({ open, onClose, payment, order, onSettled }: PaymentGatewayDialogProps) {
  const verifyPayment = useVerifyPayment();
  const mockComplete = useMockCompletePayment();
  const [result, setResult] = useState<Payment["status"] | null>(null);
  const isMock = order.provider === "mock";

  useEffect(() => {
    if (!open) setResult(null);
  }, [open]);

  useEffect(() => {
    if (!open || isMock || !order.publicKey) return;
    // Real gateway path: load Razorpay's checkout script and open the
    // widget. Inert in this environment (no live key configured), but this
    // is the actual integration, not a placeholder.
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      if (!window.Razorpay) return;
      const rzp = new window.Razorpay({
        key: order.publicKey,
        amount: Math.round(Number(payment.amount) * 100),
        currency: payment.currency,
        order_id: order.providerOrderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const updated = await verifyPayment.mutateAsync({
              paymentId: payment.id,
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            setResult(updated.status);
            onSettled(updated.status);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment verification failed");
          }
        },
      });
      rzp.open();
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMock, order.publicKey]);

  const handleSimulate = (outcome: "success" | "failure") => {
    mockComplete.mutate(
      { paymentId: payment.id, outcome },
      {
        onSuccess: (updated) => {
          setResult(updated.status);
          onSettled(updated.status);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to simulate payment"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isMock ? "Test Payment Gateway" : "Complete Payment"}</DialogTitle>
        </DialogHeader>

        {result === "paid" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-success" />
            <p className="font-medium">Payment verified successfully</p>
          </div>
        )}
        {result === "failed" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="font-medium">Payment failed</p>
            <p className="text-sm text-muted-foreground">No charge was confirmed. You can try again.</p>
          </div>
        )}

        {!result && isMock && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-3 text-sm">
              <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
              <p>
                No live payment gateway is configured. This simulates the gateway's own outcome — the server still
                verifies a signed callback exactly as it would for a real provider.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">
                  ₹{Number(payment.amount).toLocaleString("en-IN")} {payment.currency}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => handleSimulate("success")} disabled={mockComplete.isPending}>
                Simulate Success
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleSimulate("failure")}
                disabled={mockComplete.isPending}
              >
                Simulate Failure
              </Button>
            </div>
          </div>
        )}

        {!result && !isMock && (
          <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <ShieldCheck className="w-8 h-8 text-primary" />
            Waiting for the payment gateway...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
