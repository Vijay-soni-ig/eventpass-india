import { ReactNode } from 'react';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import RoleRoute from '@/components/RoleRoute';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';

interface OrganizerRouteProps {
  children: ReactNode;
}

// Gated on real OrganizerMembership rows (user.roles.organizer), never on
// the signup-time userType flag. Platform admins retain direct platform access.
// A normal organizer cannot enter the main Organizer workspace until the minimum
// activation setup is complete: organization profile + first event + event basics.
// Publishing is deliberately a recommended activation step, not a workspace gate.
// The required event setup routes remain reachable while activation is incomplete,
// otherwise the onboarding checklist would dead-end against this same route gate.
// Only these exact event routes are opened, and only after the profile is complete.
const ONBOARDING_EVENT_STEP_PATHS = ['/organizer/events/new', '/organizer/events/:id', '/organizer/events/:id/edit'];

const OrganizerWorkspaceGate = ({ children }: OrganizerRouteProps) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { data: onboarding, isLoading, isError, refetch } = useOnboarding();

  if (user?.roles?.platformAdmin) return <>{children}</>;

  if (isLoading) return <LoadingState label="Checking your organizer setup..." />;
  if (isError || !onboarding) {
    return <ErrorState description="We couldn't verify your organizer setup. Your workspace is locked until setup can be verified." onRetry={() => refetch()} />;
  }

  if (onboarding.required && !onboarding.completed) {
    const profileDone = onboarding.steps.some((step) => step.key === 'organization-profile' && step.completed);
    const eventCreated = onboarding.steps.some((step) => step.key === 'first-event' && step.completed);
    const eventBasicsDone = onboarding.steps.some((step) => step.key === 'event-basics' && step.completed);
    const minimumSetupComplete = profileDone && eventCreated && eventBasicsDone;
    const isEventStep = ONBOARDING_EVENT_STEP_PATHS.some((path) => matchPath({ path, end: true }, pathname));
    if (isEventStep && profileDone) return <>{children</>;
    if (minimumSetupComplete) return <>{children}</>;
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

const OrganizerRoute = ({ children }: OrganizerRouteProps) => (
  <RoleRoute
    allow={(user) => (user.roles?.organizer.length ?? 0) > 0 || !!user.roles?.platformAdmin}
    fallback="/dashboard"
  >
    <OrganizerWorkspaceGate>{children}</OrganizerWorkspaceGate>
  </RoleRoute>
);

export default OrganizerRoute;
