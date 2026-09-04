import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface OrganizerRouteProps {
  children: ReactNode;
}

// Gated on real OrganizerMembership rows (user.roles.organizer), never on
// the signup-time userType flag — a user invited into an Organizer as
// finance/operations/etc. should get in even though they signed up as a
// plain visitor. Per-page/per-action permission checks (via can()) still
// happen inside each page and, authoritatively, on the server.
const OrganizerRoute = ({ children }: OrganizerRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if ((user.roles?.organizer.length ?? 0) === 0 && !user.roles?.platformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default OrganizerRoute;
