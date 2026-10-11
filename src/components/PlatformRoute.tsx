import { ReactNode } from 'react';
import RoleRoute from '@/components/RoleRoute';

interface PlatformRouteProps {
  children: ReactNode;
}

// Match the server's requirePlatformAdmin check exactly. The API authorizes
// only the current database-backed platformRole, so a legacy or inconsistent
// roles.platformAdmin flag must not send a user into a platform-only UI.
const PlatformRoute = ({ children }: PlatformRouteProps) => (
  <RoleRoute allow={(user) => user.platformRole === "super_admin"} fallback="/dashboard">
    {children}
  </RoleRoute>
);

export default PlatformRoute;
