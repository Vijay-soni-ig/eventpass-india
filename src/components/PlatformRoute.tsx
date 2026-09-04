import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface PlatformRouteProps {
  children: ReactNode;
}

// Guards routes that require the PLATFORM_ADMIN role. Not yet wired into
// any route in App.tsx (there is no platform console UI to protect yet),
// but available the moment one is added — the server already enforces this
// role independently via requirePlatformAdmin, so this component is a UX
// convenience, not the security boundary.
const PlatformRoute = ({ children }: PlatformRouteProps) => {
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

  if (!user.roles?.platformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PlatformRoute;
