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
  const [isStarting, setIsStarting] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const startInProgressRef = useRef(false);
  const mountedRef = useRef(true);

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
    if (!containerRef.current || startInProgressRef.current || scannerRef.current?.isScanning) return;

    startInProgressRef.current = true;
    setIsStarting(true);
    setError(null);
    setHasPermission(null);

    try {
      if (!window.isSecureContext) {
        throw new Error("Camera access requires a secure HTTPS connection.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is unavailable in this browser or preview environment.");
      }

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

      if (!mountedRef.current) {
        await scannerRef.current.stop().catch(() => {});
        return;
      }

      setIsScanning(true);
      setHasPermission(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err || "Failed to start camera");
      const errorName = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name ?? "") : "";
      const permissionDenied = /permission|denied|notallowed/i.test(`${errorName} ${errorMessage}`);

      if (mountedRef.current) {
        setError(errorMessage);
        setHasPermission(permissionDenied ? false : null);

        if (permissionDenied) {
          toast.error("Camera permission denied", {
            description: "Allow camera access in your browser settings, then retry.",
          });
        } else {
          toast.error("Failed to start scanner", {
            description: errorMessage,
          });
        }
      }
    } finally {
      startInProgressRef.current = false;
      if (mountedRef.current) setIsStarting(false);
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

  // Cleanup on unmount. A pending start checks mountedRef before keeping its stream.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const toggleScanner = () => {
    if (isStarting) return;
    if (isScanning) {
      void stopScanner();
    } else {
      void startScanner();
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
              {hasPermission === false ? "Camera permission denied. Allow access in browser settings." : error ? "Camera unavailable. Use Manual entry or retry." : "Click Start Camera to begin scanning"}
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
        <Button onClick={toggleScanner} className="flex-1" disabled={isStarting} variant={isScanning ? "destructive" : "default"}>
          {isStarting ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Starting Camera...
            </>
          ) : isScanning ? (
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
        {error && (
          <Button variant="outline" onClick={() => void startScanner()} disabled={isStarting}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
