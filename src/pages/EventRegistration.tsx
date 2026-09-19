import { FormEvent, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ArrowLeft, Users, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicEvent } from "@/hooks/usePublicEvents";
import { api, ApiError } from "@/lib/apiClient";

type Registration = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  fullName: string;
  email: string;
};

export default function EventRegistration() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = usePublicEvent(id);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", companyName: "", consentAccepted: false });
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) {
    return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-10 space-y-5"><Skeleton className="h-8 w-2/3"/><Skeleton className="h-96 w-full max-w-2xl"/></main><Footer/></div>;
  }

  if (isError || !data) {
    return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-20"><ErrorState title="Event not found" description="This event may no longer be public." onRetry={() => refetch()}/></main><Footer/></div>;
  }

  const { event } = data;
  const registrationEnabled = event.moduleEnablements.some((module) => module.moduleType === "REGISTRATION");
  const ticketingEnabled = event.moduleEnablements.some((module) => module.moduleType === "TICKETING");

  if (!registrationEnabled) {
    return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-20"><ErrorState title="Registration is unavailable" description="This event is not currently accepting registrations." onRetry={() => navigate(`/event/${event.id}`)}/></main><Footer/></div>;
  }

  async function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await api.post<{ registration: Registration }>("/api/registrations", {
        eventId: event.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        companyName: form.companyName || undefined,
        consentAccepted: form.consentAccepted,
      }, { "Idempotency-Key": idempotencyKey.current });
      setRegistration(response.registration);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (registration) {
    const pending = registration.status === "PENDING";
    return <div className="min-h-screen bg-background"><Header/><main className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-2xl">
        <CardContent className="p-8 text-center space-y-5">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary"/>
          <div>
            <h1 className="text-2xl font-bold">{pending ? "Registration submitted" : "You're registered"}</h1>
            <p className="mt-2 text-muted-foreground">{pending ? "Your registration is pending organizer approval." : "Your registration has been confirmed."}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 text-left text-sm">
            <p><span className="font-medium">Event:</span> {event.title}</p>
            <p><span className="font-medium">Name:</span> {registration.fullName}</p>
            <p><span className="font-medium">Email:</span> {registration.email}</p>
            <p><span className="font-medium">Registration ID:</span> {registration.id}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild><Link to={`/event/${event.id}`}>Back to event</Link></Button>
            {registration.status === "CONFIRMED" && ticketingEnabled && data.linkedExhibitionId && (
              <Button asChild variant="outline" className="gap-2">
                <Link to={`/exhibition/${data.linkedExhibitionId}?registration=${encodeURIComponent(registration.id)}`}>
                  <Ticket className="h-4 w-4" /> Continue to tickets
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main><Footer/></div>;
  }

  return <div className="min-h-screen bg-background"><Header/>
    <main className="container mx-auto px-4 py-8">
      <Link to={`/event/${event.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="h-4 w-4"/>Back to event</Link>
      <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-start">
        <section>
          <p className="text-sm text-primary font-medium flex items-center gap-2"><Users className="h-4 w-4"/>Event registration</p>
          <h1 className="mt-2 text-3xl font-bold">{event.title}</h1>
          <p className="mt-3 text-muted-foreground">Register to attend this event. Your details are used only to manage your event registration.</p>
        </section>
        <Card>
          <CardHeader><CardTitle>Registration details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div><Label htmlFor="registration-name">Full name</Label><Input id="registration-name" required minLength={2} maxLength={120} value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}/></div>
              <div><Label htmlFor="registration-email">Email</Label><Input id="registration-email" type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}/></div>
              <div><Label htmlFor="registration-phone">Phone <span className="text-muted-foreground">(optional)</span></Label><Input id="registration-phone" maxLength={30} value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}/></div>
              <div><Label htmlFor="registration-company">Company <span className="text-muted-foreground">(optional)</span></Label><Input id="registration-company" maxLength={160} value={form.companyName} onChange={(e) => setForm({...form, companyName: e.target.value})}/></div>
              <div className="flex items-start gap-3"><Checkbox id="registration-consent" checked={form.consentAccepted} onCheckedChange={(checked) => setForm({...form, consentAccepted: checked === true})}/><Label htmlFor="registration-consent" className="text-sm leading-5 font-normal">I agree to the event registration terms and consent to the organizer using these details to manage my attendance.</Label></div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting || !form.consentAccepted}>{submitting ? "Submitting…" : "Complete registration"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main><Footer/></div>;
}
