import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeResult } from "html5-qrcode";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface QRCodeScannerProps {
  onScan: (result: string) => void;
  isActive?: boolean;
}

export function QRCodeScanner({ onScan, isActive = false }: QRCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const handleScanSuccess = useCallback(
    (decodedText: string, _result: Html5QrcodeResult) => {
      // Prevent duplicate scans within 2 seconds
      const now = Date.now();
      if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 2000) {
        return;
      }

      lastScanRef.current = decodedText;
      lastScanTimeRef.current = now;

      // Vibrate on successful scan if available
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }

      onScan(decodedText);
    },
    [onScan]
  );

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current?.isScanning) return;

    try {
      setError(null);

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-scanner-container");
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        handleScanSuccess,
        () => {} // Ignore scan failures (no QR in frame)
      );

      setIsScanning(true);
      setHasPermission(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start camera";
      setError(errorMessage);
      setHasPermission(false);

      if (errorMessage.includes("Permission")) {
        toast.error("Camera permission denied", {
          description: "Please allow camera access to scan QR codes.",
        });
      } else {
        toast.error("Failed to start scanner", {
          description: errorMessage,
        });
      }
    }
  }, [handleScanSuccess]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        setIsScanning(false);
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
  }, []);

  // Auto-start/stop based on isActive prop
  useEffect(() => {
    if (isActive && !isScanning) {
      startScanner();
    } else if (!isActive && isScanning) {
      stopScanner();
    }
  }, [isActive, isScanning, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const toggleScanner = () => {
    if (isScanning) {
      stopScanner();
    } else {
      startScanner();
    }
  };

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="relative aspect-square bg-secondary rounded-lg overflow-hidden">
        {/* Scanner container */}
        <div id="qr-scanner-container" className="w-full h-full" />

        {/* Overlay when not scanning */}
        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary">
            <div className="w-48 h-48 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center mb-4">
              <Camera className="w-16 h-16 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              {hasPermission === false ? "Camera access denied" : "Click Start Camera to begin scanning"}
            </p>
          </div>
        )}

        {/* Scanning overlay with corner markers */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 relative">
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
              {/* Scanning line animation */}
              <div className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-destructive/90 text-destructive-foreground px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={toggleScanner} className="flex-1" variant={isScanning ? "destructive" : "default"}>
          {isScanning ? (
            <>
              <CameraOff className="w-4 h-4 mr-2" />
              Stop Camera
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Start Camera
            </>
          )}
        </Button>
        {hasPermission === false && (
          <Button variant="outline" onClick={startScanner}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
