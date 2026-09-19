import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Keyboard, QrCode, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import { QRCodeScanner } from "@/components/exhibitor/scanner/QRCodeScanner";
import { useEvents } from "@/hooks/useEvents";
import { useUniversalEventTicketCheckIn } from "@/hooks/organizer/useUniversalCheckIn";

type ScanState = "success" | "duplicate" | "rejected" | "error";

interface ScanResult {
  state: ScanState;
  attendeeName?: string;
  attendeeEmail?: string;
  ticketCode?: string;
  message: string;
  timestamp: Date;
}

function resultIcon(state: ScanState) {
  if (state === "success") return <CheckCircle2 className="h-12 w-12 text-success" />;
  if (state === "duplicate") return <AlertCircle className="h-12 w-12 text-warning" />;
  return <XCircle className="h-12 w-12 text-destructive" />;
}

export default function UniversalCheckInScanner() {
  const { data, isLoading, isError, refetch } = useEvents({ status: "PUBLISHED", archived: false, page: 1, limit: 100 });
  const events = data?.events ?? [];
  const [selectedEventId, setSelectedEventId] = useState("");
  const [manualPayload, setManualPayload] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<ScanResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const checkIn = useUniversalEventTicketCheckIn();

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId), [events, selectedEventId]);

  const processScan = useCallback(async (qrPayload: string) => {
    if (processing || !qrPayload.trim()) return;
    setProcessing(true);
    try {
      const response = await checkIn.mutateAsync({ qrPayload: qrPayload.trim(), eventId: selectedEventId || undefined });
      const result: ScanResult = {
        state: "success",
        attendeeName: response.ticket.attendeeName,
        attendeeEmail: response.ticket.attendeeEmail,
        ticketCode: response.ticket.ticketCode,
        message: "Ticket checked in successfully.",
        timestamp: new Date(),
      };
      setLastResult(result);
      setRecent((items) => [result, ...items].slice(0, 10));
      toast.success("Check-in successful", { description: response.ticket.attendeeName });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const duplicate = apiError?.status === 409 && apiError.message.toLowerCase().includes("already");
      const result: ScanResult = {
        state: duplicate ? "duplicate" : apiError ? "rejected" : "error",
        message: apiError?.message ?? "The check-in request failed. Please try again.",
        timestamp: new Date(),
      };
      setLastResult(result);
      setRecent((items) => [result, ...items].slice(0, 10));
      toast.error(duplicate ? "Already checked in" : "Check-in rejected", { description: result.message });
    } finally {
      setProcessing(false);
    }
  }, [checkIn, processing, selectedEventId]);

  const manualSubmit = () => {
    const value = manualPayload.trim();
    if (!value) return;
    setManualPayload("");
    void processScan(value);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Ticket Check-in</h1>
          <p className="text-muted-foreground">Scan a paid universal EventTix QR ticket at the entrance.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
          <ShieldCheck className="h-4 w-4 text-success" />
          Server validated
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="checkin-event" className="text-sm font-medium">Event</label>
          {selectedEvent && <span className="text-xs text-muted-foreground">Only tickets for this event will be accepted.</span>}
        </div>
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger id="checkin-event" className="w-full sm:max-w-xl">
            <SelectValue placeholder={isLoading ? "Loading events..." : "Select an event before scanning"} />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}
          </SelectContent>
        </Select>
        {isError && <div className="mt-3 flex items-center gap-2 text-sm text-destructive"><XCircle className="h-4 w-4" />Could not load events. <Button variant="link" className="h-auto p-0" onClick={() => refetch()}>Retry</Button></div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <Tabs defaultValue="camera">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="camera"><QrCode className="mr-2 h-4 w-4" />Camera</TabsTrigger>
              <TabsTrigger value="manual"><Keyboard className="mr-2 h-4 w-4" />Manual</TabsTrigger>
            </TabsList>
            <TabsContent value="camera" className="mt-4">
              {!selectedEventId ? (
                <div className="flex aspect-square flex-col items-center justify-center rounded-lg bg-secondary p-6 text-center">
                  <QrCode className="mb-3 h-12 w-12 text-muted-foreground" />
                  <p className="font-medium">Select an event first</p>
                  <p className="mt-1 text-sm text-muted-foreground">This prevents scanning a ticket into the wrong event.</p>
                </div>
              ) : <QRCodeScanner onScan={processScan} isActive={!processing} />}
            </TabsContent>
            <TabsContent value="manual" className="mt-4">
              <div className="flex aspect-square flex-col items-center justify-center rounded-lg bg-secondary p-6">
                <Keyboard className="mb-4 h-12 w-12 text-muted-foreground" />
                <Input value={manualPayload} onChange={(event) => setManualPayload(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") manualSubmit(); }} placeholder="Paste the full ETX1 QR payload" aria-label="QR payload" />
                <Button className="mt-3 w-full max-w-xs" disabled={!selectedEventId || !manualPayload.trim() || processing} onClick={manualSubmit}>Validate & Check In</Button>
                <p className="mt-3 max-w-md text-center text-xs text-muted-foreground">The signed QR payload is validated on the server. Ticket IDs and status are never trusted from the browser.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {lastResult ? (
            <div className="rounded-xl border-2 border-border bg-card p-6">
              <div className="flex items-center gap-4">
                {resultIcon(lastResult.state)}
                <div>
                  <h2 className="font-semibold">{lastResult.state === "success" ? "Check-in Successful" : lastResult.state === "duplicate" ? "Already Checked In" : "Check-in Rejected"}</h2>
                  <p className="text-sm text-muted-foreground">{lastResult.message}</p>
                </div>
              </div>
              {(lastResult.attendeeName || lastResult.ticketCode) && <div className="mt-5 grid gap-3 rounded-lg bg-secondary p-4 sm:grid-cols-2">
                {lastResult.attendeeName && <div className="flex gap-2"><UserRound className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Attendee</p><p className="font-medium">{lastResult.attendeeName}</p></div></div>}
                {lastResult.ticketCode && <div><p className="text-xs text-muted-foreground">Ticket</p><p className="font-mono text-sm">{lastResult.ticketCode}</p></div>}
              </div>}
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{lastResult.timestamp.toLocaleTimeString()}</p>
            </div>
          ) : <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground"><QrCode className="mx-auto mb-3 h-10 w-10 opacity-40" /><p>No scan yet</p><p className="text-sm">Scan a ticket to see the result.</p></div>}

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div><h2 className="font-semibold">Recent scans</h2><p className="text-xs text-muted-foreground">This scanner session</p></div>
              <Button variant="ghost" size="sm" onClick={() => setRecent([])} disabled={!recent.length}>Clear</Button>
            </div>
            <div className="max-h-64 divide-y divide-border overflow-y-auto">
              {recent.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No scans yet.</p> : recent.map((scan, index) => (
                <div key={index} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {resultIcon(scan.state)}
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{scan.attendeeName || scan.message}</p><p className="text-xs text-muted-foreground">{scan.ticketCode || scan.message}</p></div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{scan.timestamp.toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Operational note:</strong> Universal check-in is intentionally online-only. Do not mark a visitor as checked in while offline because the server is the source of truth and two scanners must never both grant entry.
      </div>
    </div>
  );
}
