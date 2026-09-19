import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, Circle, RefreshCw, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { resolveHomeRoute } from "@/lib/permissions";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: onboarding, isLoading, isError, refetch, isFetching } = useOnboarding();

  useEffect(() => {
    if (onboarding && (!onboarding.required || onboarding.completed)) {
      navigate(resolveHomeRoute(user?.roles), { replace: true });
    }
  }, [onboarding, navigate, user?.roles]);

  if (isLoading) return <LoadingState label="Preparing your setup..." />;
  if (isError || !onboarding) {
    return <ErrorState description="We couldn't load your onboarding progress." onRetry={() => refetch()} />;
  }

  const isOrganizer = onboarding.role === "organizer";
  const requiredSteps = onboarding.steps.filter((step) => step.required);
  const requiredComplete = requiredSteps.filter((step) => step.completed).length;
  const nextStep = onboarding.steps.find((step) => step.required && !step.completed) ?? onboarding.steps.find((step) => !step.completed);

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isOrganizer ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-primary">ExhibitTix setup</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {isOrganizer ? "Set up your organizer workspace" : "Set up your exhibitor profile"}
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            {isOrganizer
              ? "Complete the essentials first. We will guide you from organization details to a publish-ready exhibition."
              : "Complete your company profile first, then we will guide you into exhibition participation and stall booking."}
          </p>
        </div>

        <Card className="mb-6 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Setup progress</p>
              <p className="text-xs text-muted-foreground mt-1">
                {requiredComplete} of {requiredSteps.length} required steps complete
              </p>
            </div>
            <span className="text-sm font-semibold">{onboarding.percent}%</span>
          </div>
          <Progress value={onboarding.percent} aria-label={`Onboarding progress: ${onboarding.percent}%`} />
        </Card>

        <div className="space-y-3">
          {onboarding.steps.map((step, index) => (
            <Card key={step.key} className={`p-4 sm:p-5 ${step.completed ? "border-primary/20" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="mt-0.5 shrink-0">
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" aria-label="Completed" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" aria-label="Not completed" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{index + 1}. {step.title}</p>
                    {step.required ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Required</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Recommended</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
                {!step.completed && (
                  <Button asChild size="sm" variant={step.key === nextStep?.key ? "default" : "outline"} className="shrink-0 gap-1">
                    <Link to={step.href}>
                      {step.key === nextStep?.key ? "Continue" : "Open"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You can leave setup and return later. Your progress is calculated from the actual account and business data, so it will never become stale.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0 gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </main>
    </div>
  );
}
