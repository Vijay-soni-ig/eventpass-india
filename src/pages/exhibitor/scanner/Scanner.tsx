import { useState, useCallback } from "react";
import { QrCode, CheckCircle, XCircle, RefreshCw, User, Keyboard, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import { QRCodeScanner } from "@/components/exhibitor/scanner/QRCodeScanner";
import { OfflineIndicator } from "@/components/exhibitor/scanner/OfflineIndicator";
import { useOfflineSync, cacheData, getCachedItem } from "@/hooks/exhibitor/use-offline-sync";
import { useParticipations } from "@/hooks/exhibitor/useParticipations";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useLookupTicket, useCheckInTicket } from "@/hooks/exhibitor/useScanner";
import { useLookupTicketOrganizer, useCheckInTicketOrganizer } from "@/hooks/organizer/useOrganizerScanner";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission, hasOrganizerPermission } from "@/lib/permissions";
import type { TicketBooking } from "@/types/exhibitor";

interface CheckInResult {
  booking: TicketBooking;
  status: "success" | "duplicate" | "error" | "offline-queued";
  timestamp: Date;
}

interface ScannerProps {
  /** Which tenant axis this Scanner instance authorizes against — shared UI,
   *  two data scopes (see UI-01D). "exhibitor" (default) preserves the
   *  original behavior for the exhibitor-dashboard route. */
  context?: "organizer" | "exhibitor";
}

export default function Scanner({ context = "exhibitor" }: ScannerProps) {
  const { user } = useAuth();
  const canOverride =
    context === "organizer"
      ? hasOrganizerPermission(user?.roles, "checkin:override")
      : hasExhibitorPermission(user?.roles, "checkin:override");

  // Only exhibitions this exhibitor's business is CONFIRMED to participate
  // in — matches the authorization boundary the exhibitor-axis backend
  // scanner endpoints enforce (see exhibitionIdsForConfirmedExhibitor), so
  // this filter never lists an exhibition the lookup itself would reject.
  // Disabled entirely for organizer context — an organizer scanner has no
  // exhibitor participations, so there's no reason to fetch them.
  const { data: participations = [] } = useParticipations({ enabled: context === "exhibitor" });
  const exhibitorExhibitions = participations.filter((p) => p.status === "confirmed" && p.exhibition).map((p) => p.exhibition!);

  // Organizer-owned exhibitions (server-scoped by exhibition:view, which
  // every organizer role that also holds scanner:use already has) — the
  // organizer-axis counterpart to the participations list above. Disabled
  // for exhibitor context so this Scanner never fetches every organizer
  // exhibition unnecessarily.
  const { data: organizerExhibitions = [] } = useExhibitions({ enabled: context === "organizer" });

  const exhibitions = context === "organizer" ? organizerExhibitions : exhibitorExhibitions;

  // Both mutation pairs are always declared (Rules of Hooks — useMutation
  // never fetches until .mutateAsync is called, so declaring the unused axis
  // costs nothing) and only the one matching `context` is ever invoked. This
  // is what keeps the QR/check-in UI below single and shared instead of
  // forking into two Scanner implementations.
  const lookupTicketExhibitor = useLookupTicket();
  const checkInTicketExhibitor = useCheckInTicket();
  const lookupTicketOrganizer = useLookupTicketOrganizer();
  const checkInTicketOrganizer = useCheckInTicketOrganizer();
  const lookupBooking = context === "organizer" ? lookupTicketOrganizer : lookupTicketExhibitor;
  const checkInBooking = context === "organizer" ? checkInTicketOrganizer : checkInTicketExhibitor;

  const { isOnline, addToQueue } = useOfflineSync();

  const [lastScan, setLastScan] = useState<CheckInResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [selectedExhibition, setSelectedExhibition] = useState<string>("");
  const [recentScans, setRecentScans] = useState<CheckInResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overridingId, setOverridingId] = useState<string | null>(null);

  const recordResult = (result: CheckInResult) => {
    setLastScan(result);
    setRecentScans((prev) => [result, ...prev.slice(0, 9)]);
  };

  const processCheckIn = useCallback(
    async (code: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        // The lookup is read-only context (attendee name, ticket type, and
        // — if already checked in — who scanned it and when). It is never
        // used to decide success/duplicate by itself; only the check-in
        // call's own server response does that, closing the race window a
        // client-side pre-check would leave open between two scanners.
        const booking = await lookupBooking.mutateAsync(code);

        if (!isOnline) {
          // Offline: there is no server to ask, so this is necessarily
          // optimistic. A local flag prevents showing "success" twice for
          // the same ticket within this offline session; the queued
          // check-in is reconciled for real once back online (a 409 there
          // just means it was already recorded — see use-offline-sync.ts).
          const checkedInKey = `checkin_${booking.id}`;
          const alreadyThisSession = booking.checkInStatus || getCachedItem<boolean>(checkedInKey);
          if (alreadyThisSession) {
            recordResult({ booking, status: "duplicate", timestamp: new Date() });
            toast.error("Already checked in", { description: "This ticket was already scanned." });
          } else {
            cacheData(checkedInKey, true);
            addToQueue("checkin", { bookingId: booking.id });
            recordResult({ booking, status: "offline-queued", timestamp: new Date() });
            toast.success(`${booking.attendeeName ?? "Attendee"} checked in (offline)`, {
              description: "Will sync when back online",
            });
          }
          return;
        }

        try {
          const { booking: updated } = await checkInBooking.mutateAsync({ bookingId: booking.id });
          recordResult({ booking: updated, status: "success", timestamp: new Date() });
          toast.success(`${updated.attendeeName ?? "Attendee"} checked in successfully!`);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            recordResult({ booking, status: "duplicate", timestamp: new Date() });
            const lastCheckIn = booking.checkIns?.[0];
            toast.error("Already checked in", {
              description: lastCheckIn
                ? `Scanned ${new Date(lastCheckIn.scannedAt).toLocaleTimeString()}${lastCheckIn.scannedByUser?.fullName ? ` by ${lastCheckIn.scannedByUser.fullName}` : ""}`
                : `${booking.attendeeName ?? "Attendee"} was previously checked in`,
            });
          } else if (err instanceof ApiError && err.status === 400) {
            recordResult({ booking, status: "error", timestamp: new Date() });
            toast.error("Cannot check in", { description: err.message });
          } else {
            throw err;
          }
        }
      } catch (err) {
        const fallback: TicketBooking = {
          id: "unknown",
          exhibitionId: "",
          ticketTypeId: null,
          buyerUserId: null,
          attendeeName: "Unknown code",
          attendeeEmail: null,
          attendeePhone: null,
          quantity: 0,
          unitPrice: 0,
          amountPaid: 0,
          paymentStatus: "pending",
          qrCode: code,
          checkInStatus: false,
          checkInTime: null,
          visitDate: null,
          createdAt: new Date().toISOString(),
        };
        recordResult({ booking: fallback, status: "error", timestamp: new Date() });
        toast.error("Ticket not found", {
          description: err instanceof Error ? err.message : "This code doesn't match any of your bookings",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, lookupBooking, isOnline, addToQueue, checkInBooking]
  );

  const handleForceReentry = async (booking: TicketBooking) => {
    setOverridingId(booking.id);
    try {
      const { booking: updated } = await checkInBooking.mutateAsync({ bookingId: booking.id, force: true });
      recordResult({ booking: updated, status: "success", timestamp: new Date() });
      toast.success(`Re-entry authorized for ${updated.attendeeName ?? "attendee"}`, {
        description: "This override is recorded in the check-in audit trail.",
      });
    } catch (err) {
      toast.error("Could not authorize re-entry", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setOverridingId(null);
    }
  };

  const handleQRScan = useCallback(
    (code: string) => {
      processCheckIn(code);
    },
    [processCheckIn]
  );

  const handleManualCheckIn = () => {
    if (manualCode.trim()) {
      processCheckIn(manualCode.trim());
      setManualCode("");
    }
  };

  const successCount = recentScans.filter((s) => s.status === "success" || s.status === "offline-queued").length;
  const duplicateCount = recentScans.filter((s) => s.status === "duplicate").length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">QR Scanner</h1>
          <p className="text-muted-foreground">Check-in attendees using QR codes or manual entry</p>
        </div>
        <OfflineIndicator />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <div className="space-y-6">
          {/* Exhibition Selection */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Filter by Exhibition (optional)</h3>
              </div>
              <Select value={selectedExhibition} onValueChange={setSelectedExhibition}>
                <SelectTrigger>
                  <SelectValue placeholder="All exhibitions" />
                </SelectTrigger>
                <SelectContent>
                  {exhibitions
                    .filter((e) => e.status === "live")
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {context === "organizer"
                  ? "Lookups are automatically scoped to your organizer's exhibitions."
                  : "Lookups are automatically scoped to your own exhibitions."}
              </p>
            </div>
          </div>

          {/* Scanner Tabs */}
          <div className="bg-card border border-border rounded-xl p-6">
            <Tabs defaultValue="camera" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="camera" className="flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Camera
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4" />
                  Manual
                </TabsTrigger>
              </TabsList>

              <TabsContent value="camera" className="space-y-4">
                <QRCodeScanner onScan={handleQRScan} isActive />
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                <div className="aspect-square bg-secondary rounded-lg flex flex-col items-center justify-center p-6">
                  <Keyboard className="w-16 h-16 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center text-sm mb-4">
                    Enter the ticket code manually
                  </p>
                  <div className="w-full max-w-xs space-y-3">
                    <Input
                      placeholder="Enter ticket QR code..."
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualCheckIn()}
                      className="text-center"
                    />
                    <Button onClick={handleManualCheckIn} className="w-full" disabled={!manualCode.trim() || isProcessing}>
                      Check In
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Last Scan Result */}
          {lastScan && (
            <div
              className={`rounded-xl p-6 border-2 transition-all animate-scale-in ${
                lastScan.status === "success" || lastScan.status === "offline-queued"
                  ? "bg-success/10 border-success/30"
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                {lastScan.status === "success" || lastScan.status === "offline-queued" ? (
                  <CheckCircle className="w-12 h-12 text-success" />
                ) : (
                  <XCircle className="w-12 h-12 text-destructive" />
                )}
                <div>
                  <p className="font-semibold text-lg">
                    {lastScan.status === "success"
                      ? "Check-in Successful"
                      : lastScan.status === "offline-queued"
                        ? "Checked In (Offline)"
                        : lastScan.status === "duplicate"
                          ? "Already Checked In"
                          : "Ticket Not Found"}
                  </p>
                  <p className="text-muted-foreground">{lastScan.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
              <div className="bg-card rounded-lg p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg">{lastScan.booking.attendeeName ?? "Unknown"}</p>
                  <p className="text-muted-foreground">{lastScan.booking.attendeeEmail ?? ""}</p>
                  {lastScan.booking.ticketType?.name && (
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary">
                      {lastScan.booking.ticketType.name}
                    </span>
                  )}
                </div>
              </div>
              {lastScan.status === "duplicate" && canOverride && lastScan.booking.id !== "unknown" && (
                <div className="mt-4 pt-4 border-t border-destructive/20">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => handleForceReentry(lastScan.booking)}
                    disabled={overridingId === lastScan.booking.id}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {overridingId === lastScan.booking.id ? "Authorizing..." : "Authorize Re-entry"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Owner/admin only. Recorded as an explicit override, not a normal check-in.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recent Scans */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">Recent Scans</h3>
              <Button variant="ghost" size="sm" onClick={() => setRecentScans([])} disabled={recentScans.length === 0}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
            <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
              {recentScans.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <QrCode className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No scans yet</p>
                  <p className="text-sm">Start scanning to see results here</p>
                </div>
              ) : (
                recentScans.map((scan, index) => (
                  <div key={index} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {scan.status === "success" || scan.status === "offline-queued" ? (
                        <CheckCircle className="w-5 h-5 text-success" />
                      ) : (
                        <XCircle className="w-5 h-5 text-warning" />
                      )}
                      <div>
                        <p className="font-medium">{scan.booking.attendeeName ?? "Unknown"}</p>
                        <p className="text-sm text-muted-foreground">{scan.booking.ticketType?.name ?? ""}</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{scan.timestamp.toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-success">{successCount}</p>
              <p className="text-sm text-muted-foreground">Checked In</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-warning">{duplicateCount}</p>
              <p className="text-sm text-muted-foreground">Duplicates</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{recentScans.length}</p>
              <p className="text-sm text-muted-foreground">Total Scans</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
