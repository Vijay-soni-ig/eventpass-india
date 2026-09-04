import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ExhibitorRouteProps {
  children: ReactNode;
}

const ExhibitorRoute = ({ children }: ExhibitorRouteProps) => {
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

  // Entry to the exhibitor dashboard shell isn't gated on the signup-time
  // userType flag alone — a user invited as exhibitor staff/admin should
  // get in even if they originally signed up as a visitor. Real permission
  // checks for what they can see/do inside still happen per-page and,
  // authoritatively, on the server.
  const isExhibitorSide = user.userType === 'exhibitor' || (user.roles?.exhibitor.length ?? 0) > 0;
  if (!isExhibitorSide) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ExhibitorRoute;
