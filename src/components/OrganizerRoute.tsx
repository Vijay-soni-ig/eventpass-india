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

// Organizer workspace access is unlocked only after the organizer's own profile,
// branding, and organizer-page setup are complete. Creating an event is intentionally
// not part of activation: organizers should be able to enter the dashboard first and
// decide what they want to create next.
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
