import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppUser } from '@/hooks/useAuth';
import AccessDenied from '@/pages/AccessDenied';

interface RoleRouteProps {
  children: ReactNode;
  /** Returns true if the authenticated user may enter. Not the security
   *  boundary — the server independently re-enforces the same role/permission
   *  checks on every request, which is what actually protects the data. */
  allow: (user: AppUser) => boolean;
  /** Where "Go to your dashboard" on the Access Denied page should send the
   *  user, and where a signed-in-but-disallowed user should be able to go. */
  fallback: string;
}

const RoleRoute = ({ children, allow, fallback }: RoleRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    // UI-04 — preserve the deep-linked destination (e.g. /my-tickets/:id)
    // across sign-in, reusing Auth.tsx's existing, already-safe `redirect`
    // param handling (relative-path-only, rejects `//`/`/\` to prevent an
    // open redirect) rather than always dropping the user on the generic
    // post-login home route.
    const destination = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(destination)}`} replace />;
  }

  if (!allow(user)) {
    return <AccessDenied homePath={fallback} />;
  }

  return <>{children}</>;
};

export default RoleRoute;
