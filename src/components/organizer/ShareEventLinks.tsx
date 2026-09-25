import { Copy, Check, Share2, Users, Building2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = { eventId: string; exhibitionId?: string | null };

export default function ShareEventLinks({ eventId, exhibitionId }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"visitor" | "exhibitor" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const visitorUrl = `${origin}/event/${eventId}`;
  const exhibitorUrl = exhibitionId ? `${origin}/exhibition/${exhibitionId}/exhibit` : null;

  const copy = async (kind: "visitor" | "exhibitor", url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      toast.success(`${kind === "visitor" ? "Visitor" : "Exhibitor"} link copied`);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const share = async (title: string, url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    await copy(title.toLowerCase().includes("visitor") ? "visitor" : "exhibitor", url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Share2 className="h-4 w-4" />Share</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share event</DialogTitle>
          <DialogDescription>Use the visitor link for attendees and the exhibitor link for businesses applying for a stall.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Visitors</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Event details, registration and ticket purchase.</p>
              <div className="rounded-md border bg-muted/30 p-2 text-xs break-all">{visitorUrl}</div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => copy("visitor", visitorUrl)}>
                  {copied === "visitor" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied === "visitor" ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => share("Visitor event link", visitorUrl)} aria-label="Share visitor link"><Share2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Exhibitors</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Exhibitor information, application and stall booking.</p>
              {exhibitorUrl ? (
                <>
                  <div className="rounded-md border bg-muted/30 p-2 text-xs break-all">{exhibitorUrl}</div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => copy("exhibitor", exhibitorUrl)}>
                      {copied === "exhibitor" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copied === "exhibitor" ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => share("Exhibitor event link", exhibitorUrl)} aria-label="Share exhibitor link"><ExternalLink className="h-4 w-4" /></Button>
                  </div>
                </>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">This event does not have the Exhibition module enabled, so an exhibitor stall link is not available.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
