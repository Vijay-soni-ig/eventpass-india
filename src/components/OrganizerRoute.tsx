import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
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
const OrganizerWorkspaceGate = ({ children }: OrganizerRouteProps) => {
  const { user } = useAuth();
  const { data: onboarding, isLoading, isError, refetch } = useOnboarding();

  if (user?.roles?.platformAdmin) return <>{children}</>;

  if (isLoading) return <LoadingState label="Checking your organizer setup..." />;
  if (isError || !onboarding) {
    return <ErrorState description="We couldn't verify your organizer setup. Your workspace is locked until setup can be verified." onRetry={() => refetch()} />;
  }

  if (onboarding.required && !onboarding.completed) {
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
