import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function TeamInvitationAccept() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Checking your invitation…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This invitation link is missing its token.");
      return;
    }
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/team-invitations/accept?token=${encodeURIComponent(token)}`)}`, { replace: true });
      return;
    }

    let cancelled = false;
    api.post<{ membership: { role: string; organizerId?: string; exhibitorBusinessId?: string } }>("/api/team-invitations/accept", { token })
      .then(({ membership }) => {
        if (cancelled) return;
        setState("success");
        setMessage("Your team access is now active.");
        toast.success("Invitation accepted");
        if (membership.organizerId) navigate("/organizer/team", { replace: true });
        else if (membership.exhibitorBusinessId) navigate("/exhibitor-dashboard/business/team", { replace: true });
        else navigate("/", { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Unable to accept this invitation.");
      });
    return () => { cancelled = true; };
  }, [token, user, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {state === "loading" ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> : <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />}
          <CardTitle>{state === "success" ? "Invitation accepted" : state === "error" ? "Invitation unavailable" : "Accepting invitation"}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {state === "error" && <Button onClick={() => navigate("/")}>Go to ExhibitTix</Button>}
        </CardContent>
      </Card>
    </main>
  );
}
