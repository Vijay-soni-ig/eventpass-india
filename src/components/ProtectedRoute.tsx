import { ReactNode } from 'react';
import RoleRoute from '@/components/RoleRoute';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => (
  <RoleRoute allow={() => true} fallback="/auth">
    {children}
  </RoleRoute>
);

export default ProtectedRoute;
