import { ReactNode } from 'react';
import RoleRoute from '@/components/RoleRoute';

interface ExhibitorRouteProps {
  children: ReactNode;
}

// Entry to the exhibitor dashboard shell isn't gated on the signup-time
// userType flag alone — a user invited as exhibitor staff/admin should
// get in even if they originally signed up as a visitor. Real permission
// checks for what they can see/do inside still happen per-page and,
// authoritatively, on the server.
const ExhibitorRoute = ({ children }: ExhibitorRouteProps) => (
  <RoleRoute
    allow={(user) => user.userType === 'exhibitor' || (user.roles?.exhibitor.length ?? 0) > 0}
    fallback="/dashboard"
  >
    {children}
  </RoleRoute>
);

export default ExhibitorRoute;
