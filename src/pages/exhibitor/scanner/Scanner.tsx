import { useState, useCallback } from "react";
import { QrCode, CheckCircle, XCircle, RefreshCw, User, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { QRCodeScanner } from "@/components/exhibitor/scanner/QRCodeScanner";
import { OfflineIndicator } from "@/components/exhibitor/scanner/OfflineIndicator";
import { useOfflineSync, cacheData, getCachedItem } from "@/hooks/exhibitor/use-offline-sync";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useLookupBooking, useCheckInBooking } from "@/hooks/exhibitor/useBookings";
import type { TicketBooking } from "@/types/exhibitor";

interface CheckInResult {
  booking: TicketBooking;
  status: "success" | "error" | "duplicate";
  timestamp: Date;
}

export default function Scanner() {
  const { data: exhibitions = [] } = useExhibitions();
  const lookupBooking = useLookupBooking();
  const checkInBooking = useCheckInBooking();
  const { isOnline, addToQueue } = useOfflineSync();

  const [lastScan, setLastScan] = useState<CheckInResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [selectedExhibition, setSelectedExhibition] = useState<string>("");
  const [recentScans, setRecentScans] = useState<CheckInResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processCheckIn = useCallback(
    async (code: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        const booking = await lookupBooking.mutateAsync(code);

        const checkedInKey = `checkin_${booking.id}`;
        const alreadyCheckedIn = booking.checkInStatus || getCachedItem<boolean>(checkedInKey);

        const result: CheckInResult = {
          booking,
          status: alreadyCheckedIn ? "duplicate" : "success",
          timestamp: new Date(),
        };

        setLastScan(result);
        setRecentScans((prev) => [result, ...prev.slice(0, 9)]);

        if (result.status === "success") {
          cacheData(checkedInKey, true);

          if (!isOnline) {
            addToQueue("checkin", { bookingId: booking.id });
            toast.success(`${booking.attendeeName ?? "Attendee"} checked in (offline)`, {
              description: "Will sync when back online",
            });
          } else {
            await checkInBooking.mutateAsync(booking.id);
            toast.success(`${booking.attendeeName ?? "Attendee"} checked in successfully!`);
          }
        } else {
          toast.error("Already checked in", {
            description: `${booking.attendeeName ?? "Attendee"} was previously checked in`,
          });
        }
      } catch (err) {
        const result: CheckInResult = {
          booking: {
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
          },
          status: "error",
          timestamp: new Date(),
        };
        setLastScan(result);
        toast.error("Ticket not found", {
          description: err instanceof Error ? err.message : "This code doesn't match any of your bookings",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, lookupBooking, isOnline, addToQueue, checkInBooking]
  );

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

  const successCount = recentScans.filter((s) => s.status === "success").length;
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
                Lookups are automatically scoped to your own exhibitions.
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
                lastScan.status === "success"
                  ? "bg-success/10 border-success/30"
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                {lastScan.status === "success" ? (
                  <CheckCircle className="w-12 h-12 text-success" />
                ) : (
                  <XCircle className="w-12 h-12 text-destructive" />
                )}
                <div>
                  <p className="font-semibold text-lg">
                    {lastScan.status === "success"
                      ? "Check-in Successful"
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
                      {scan.status === "success" ? (
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
