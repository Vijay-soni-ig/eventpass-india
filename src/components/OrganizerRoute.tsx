import { ReactNode } from 'react';
import RoleRoute from '@/components/RoleRoute';

interface OrganizerRouteProps {
  children: ReactNode;
}

// Gated on real OrganizerMembership rows (user.roles.organizer), never on
// the signup-time userType flag — a user invited into an Organizer as
// finance/operations/etc. should get in even though they signed up as a
// plain visitor. Per-page/per-action permission checks (via can()) still
// happen inside each page and, authoritatively, on the server.
const OrganizerRoute = ({ children }: OrganizerRouteProps) => (
  <RoleRoute
    allow={(user) => (user.roles?.organizer.length ?? 0) > 0 || !!user.roles?.platformAdmin}
    fallback="/dashboard"
  >
    {children}
  </RoleRoute>
);

export default OrganizerRoute;
