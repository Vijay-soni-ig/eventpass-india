import { useState } from "react";
import { QrCode, Keyboard, CheckCircle2, AlertCircle, Users, MapPin } from "lucide-react";
import { QRCodeScanner } from "@/components/exhibitor/scanner/QRCodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import { useLeadCaptureContexts, useResolveLeadTicketQr, useCaptureLeadFromTicket } from "@/hooks/exhibitor/useEventLeadCapture";

export default function UniversalLeadCapture() {
  const { data: contexts = [], isLoading, isError, refetch } = useLeadCaptureContexts();
  const resolveTicket = useResolveLeadTicketQr();
  const captureLead = useCaptureLeadFromTicket();

  const [contextId, setContextId] = useState("");
  const [stallId, setStallId] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [notes, setNotes] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<{
    status: "success" | "duplicate" | "error";
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    ticketCode?: string;
  } | null>(null);

  const context = contexts.find((item) => item.participationId === contextId);
  const availableStalls = context?.stalls ?? [];

  const capture = async (qrPayload: string) => {
    if (!context) {
      toast.error("Select your event and stall before scanning");
      return;
    }
    if (!qrPayload.trim()) return;

    setResult(null);
    try {
      const resolved = await resolveTicket.mutateAsync({ eventId: context.eventId, qrPayload: qrPayload.trim() });
      const captured = await captureLead.mutateAsync({
        eventId: context.eventId,
        ticketId: resolved.ticket.id,
        exhibitorBusinessId: resolved.exhibitorBusinessId,
        exhibitionExhibitorId: resolved.exhibitionExhibitorId,
        stallId: stallId || undefined,
        priority,
        notes: notes.trim() || undefined,
      });

      if (captured.duplicate) {
        setResult({
          status: "duplicate",
          name: resolved.ticket.attendeeName,
          email: resolved.ticket.attendeeEmail,
          phone: resolved.ticket.attendeePhone,
          ticketCode: resolved.ticket.ticketCode,
        });
        toast.info("Lead already captured", { description: "This visitor is already in your lead list for this event." });
      } else {
        setResult({
          status: "success",
          name: resolved.ticket.attendeeName,
          email: resolved.ticket.attendeeEmail,
          phone: resolved.ticket.attendeePhone,
          ticketCode: resolved.ticket.ticketCode,
        });
        toast.success("Lead captured successfully");
      }
    } catch (error) {
      setResult({ status: "error" });
      const message = error instanceof Error ? error.message : "Could not capture this lead";
      toast.error("Lead capture failed", {
        description: error instanceof ApiError ? message : "Please verify the QR belongs to a checked-in visitor for this event.",
      });
    }
  };

  const handleManual = () => {
    if (!manualCode.trim()) return;
    void capture(manualCode);
    setManualCode("");
  };

  if (isLoading) return <LoadingState label="Loading lead capture events..." />;
  if (isError) return <ErrorState description="Couldn't load your confirmed exhibition events." onRetry={() => refetch()} />;

  if (contexts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No lead capture events"
        description="You need a confirmed exhibition participation linked to an event before you can capture universal ticket leads."
      />
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Capture Visitor Lead</h1>
        <p className="text-muted-foreground">Scan a checked-in visitor's universal ticket and attribute the lead to your exhibition participation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-6">
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <Label>Event / Exhibition</Label>
              <Select value={contextId} onValueChange={(value) => { setContextId(value); setStallId(""); setResult(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  {contexts.map((item) => (
                    <SelectItem key={item.participationId} value={item.participationId}>
                      {item.eventTitle} — {item.exhibitionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {context && (
              <>
                <div className="rounded-lg bg-secondary/50 p-4 flex items-start gap-3">
                  <MapPin className="w-5 h-5 mt-0.5 text-primary" />
                  <div>
                    <p className="font-medium">{context.exhibitionName}</p>
                    <p className="text-sm text-muted-foreground">{context.eventTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Only checked-in tickets for this event can become leads.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Stall / Booth</Label>
                  <Select value={stallId} onValueChange={setStallId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your stall (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific stall</SelectItem>
                      {availableStalls.map((stall) => (
                        <SelectItem key={stall.id} value={stall.id}>{stall.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lead Priority</Label>
                    <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional visitor interest..." rows={3} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <Tabs defaultValue="camera" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="camera"><QrCode className="w-4 h-4 mr-2 inline" />Camera</TabsTrigger>
                <TabsTrigger value="manual"><Keyboard className="w-4 h-4 mr-2 inline" />Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="camera">
                <QRCodeScanner
                  onScan={(code) => void capture(code)}
                  isActive={Boolean(context) && !resolveTicket.isPending && !captureLead.isPending}
                />
              </TabsContent>

              <TabsContent value="manual" className="space-y-3">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManual()}
                  placeholder="Paste the ticket QR payload"
                  disabled={!context || resolveTicket.isPending || captureLead.isPending}
                />
                <Button className="w-full" onClick={handleManual} disabled={!context || !manualCode.trim() || resolveTicket.isPending || captureLead.isPending}>
                  {resolveTicket.isPending || captureLead.isPending ? "Capturing..." : "Capture Lead"}
                </Button>
                <p className="text-xs text-muted-foreground">Manual entry accepts the same QR payload produced by ExhibitTix tickets.</p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="space-y-6">
          {result ? (
            <div className={`rounded-xl border-2 p-6 ${result.status === "success" ? "border-success/30 bg-success/10" : result.status === "duplicate" ? "border-warning/30 bg-warning/10" : "border-destructive/30 bg-destructive/10"}`}>
              <div className="flex items-center gap-3">
                {result.status === "success" ? <CheckCircle2 className="w-10 h-10 text-success" /> : <AlertCircle className="w-10 h-10 text-warning" />}
                <div>
                  <p className="font-semibold text-lg">
                    {result.status === "success" ? "Lead Captured" : result.status === "duplicate" ? "Lead Already Captured" : "Capture Failed"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.status === "error" ? "No lead was created." : result.name || "Visitor"}
                  </p>
                </div>
              </div>
              {result.status !== "error" && (
                <div className="mt-5 space-y-2 text-sm">
                  {result.email && <p><span className="text-muted-foreground">Email:</span> {result.email}</p>}
                  {result.phone && <p><span className="text-muted-foreground">Phone:</span> {result.phone}</p>}
                  {result.ticketCode && <p><span className="text-muted-foreground">Ticket:</span> {result.ticketCode}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <QrCode className="w-14 h-14 mx-auto mb-4 text-muted-foreground/40" />
              <p className="font-medium">Ready to capture</p>
              <p className="text-sm text-muted-foreground mt-1">Select your event and scan a visitor after event check-in.</p>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5">
            <p className="font-medium">Important</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Lead capture does not perform event check-in.</li>
              <li>The visitor must already be checked in.</li>
              <li>Repeated scans are idempotent and won't create duplicate leads.</li>
              <li>The lead is attributed to your confirmed exhibitor participation.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
