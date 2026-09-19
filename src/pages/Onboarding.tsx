import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Circle, RefreshCw, Store, UserRound } from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (onboarding && (!onboarding.required || onboarding.completed)) {
      navigate(resolveHomeRoute(user?.roles), { replace: true });
    }
  }, [onboarding, navigate, user?.roles]);

  useEffect(() => {
    if (!onboarding) return;
    const nextIndex = onboarding.steps.findIndex((step) => step.required && !step.completed);
    setActiveIndex(nextIndex >= 0 ? nextIndex : onboarding.steps.findIndex((step) => !step.completed));
  }, [onboarding]);

  if (isLoading) return <LoadingState label="Preparing your setup..." />;
  if (isError || !onboarding) {
    return <ErrorState description="We couldn't load your onboarding progress." onRetry={() => refetch()} />;
  }

  const isOrganizer = onboarding.role === "organizer";
  const requiredSteps = onboarding.steps.filter((step) => step.required);
  const requiredComplete = requiredSteps.filter((step) => step.completed).length;
  const activeStep = onboarding.steps[activeIndex] ?? onboarding.steps[0];
  const completedCount = onboarding.steps.filter((step) => step.completed).length;
  const allRequiredComplete = requiredComplete === requiredSteps.length;

  const activeRequiredPosition = activeStep
    ? requiredSteps.findIndex((step) => step.key === activeStep.key) + 1
    : 0;

  const canOpenStep = (index: number) => {
    if (index <= activeIndex) return true;
    return onboarding.steps.slice(0, index).every((step) => !step.required || step.completed);
  };

  const goNext = () => {
    const nextIndex = onboarding.steps.findIndex((step, index) => index > activeIndex && (!step.required || !step.completed));
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isOrganizer ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-primary">ExhibitTix setup</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {isOrganizer ? "Build your organizer workspace" : "Set up your exhibitor workspace"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {isOrganizer
                  ? "Follow the guided path to get your first exhibition ready for exhibitors and visitors."
                  : "Complete the essentials first. You can return to the dashboard at any time."}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 self-start">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="mb-6 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Overall setup</p>
              <p className="mt-1 text-xs text-muted-foreground">{completedCount} of {onboarding.steps.length} steps complete</p>
            </div>
            <span className="text-sm font-semibold">{onboarding.percent}%</span>
          </div>
          <Progress value={onboarding.percent} aria-label={`Onboarding progress: ${onboarding.percent}%`} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit p-3">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup path</p>
            <div className="space-y-1">
              {onboarding.steps.map((step, index) => {
                const enabled = canOpenStep(index);
                return (
                  <button
                    key={step.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => enabled && setActiveIndex(index)}
                    className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors ${
                      activeIndex === index ? "bg-primary/10 text-foreground" : enabled ? "hover:bg-muted" : "opacity-50"
                    }`}
                    aria-current={activeIndex === index ? "step" : undefined}
                  >
                    <span className="mt-0.5 shrink-0">
                      {step.completed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{index + 1}. {step.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {step.completed ? "Complete" : step.required ? "Required" : "Recommended"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="overflow-hidden">
            {activeStep ? (
              <>
                <div className="border-b bg-card p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {activeStep.required ? `Required step ${activeRequiredPosition}` : "Recommended"}
                    </span>
                    {activeStep.completed && (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">Completed</span>
                    )}
                  </div>
                  <h2 className="mt-4 text-xl font-semibold sm:text-2xl">{activeStep.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{activeStep.description}</p>
                </div>

                <div className="p-6 sm:p-8">
                  {activeStep.completed ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div>
                          <p className="font-medium">This step is complete.</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            ExhibitTix verified this from your account data. You can reopen it if you need to make changes.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-muted/30 p-5 sm:p-6">
                      <p className="text-sm font-medium">What to do now</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Open the relevant workspace, complete the required fields, then return here. Your progress will be recalculated from the server.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="ghost"
                      onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
                      disabled={activeIndex === 0}
                      className="gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Previous
                    </Button>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      {activeStep.completed && activeIndex < onboarding.steps.length - 1 && (
                        <Button variant="outline" onClick={goNext} className="gap-2">
                          Next step
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                      {!activeStep.completed && (
                        <Button asChild className="gap-2">
                          <Link to={activeStep.href}>
                            {activeStep.required ? "Complete this step" : "Open step"}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8">
                <p className="font-medium">Setup complete</p>
                <p className="mt-1 text-sm text-muted-foreground">Your workspace is ready.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {allRequiredComplete
                ? "All required setup steps are complete. You can finish recommended steps or continue to your dashboard."
                : "You can leave setup and return later. Completed work is detected from the account and database, not from browser state."}
            </p>
          </div>
          {allRequiredComplete && (
            <Button variant="outline" asChild className="shrink-0">
              <Link to={resolveHomeRoute(user?.roles)}>Go to dashboard</Link>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
