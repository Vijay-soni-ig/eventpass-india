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
// A normal organizer cannot enter any Organizer workspace route until all
// required onboarding steps are complete. The required profile step has its
// own standalone route under /onboarding, so this gate cannot dead-end setup.
// The required event steps (create, basics, publish) live under /organizer/events.
// They must stay reachable while onboarding is incomplete, otherwise the checklist
// links to pages the gate then bounces back to /onboarding and setup can never finish.
// Only these exact routes are opened, and only once the profile step is done.
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
    const isEventStep = ONBOARDING_EVENT_STEP_PATHS.some((path) => matchPath({ path, end: true }, pathname));
    if (profileDone && isEventStep) return <>{children}</>;
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
