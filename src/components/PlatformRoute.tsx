import { ReactNode } from 'react';
import RoleRoute from '@/components/RoleRoute';

interface PlatformRouteProps {
  children: ReactNode;
}

// Guards routes that require the PLATFORM_ADMIN role. This is a UX
// convenience only — the server independently enforces the same role via
// requirePlatformAdmin on every /api/platform/* route, which is the real
// security boundary regardless of what this component does.
const PlatformRoute = ({ children }: PlatformRouteProps) => (
  <RoleRoute allow={(user) => !!user.roles?.platformAdmin} fallback="/dashboard">
    {children}
  </RoleRoute>
);

export default PlatformRoute;
