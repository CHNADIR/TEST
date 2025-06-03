import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

type ProtectedRouteProps = {
  allowedRoles?: Array<'superAdmin' | 'admin' | 'provider'>;
};

export const ProtectedRoute = ({ allowedRoles = [] }: ProtectedRouteProps) => {
  const { user, session, loading, userAppRole } = useAuthStore(); // Utilisez userRole du store
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return null; // This will be handled by LoadingScreen in App.tsx
  }

  // If not authenticated, redirect to /auth
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  // Utilisez userRole qui sera chargé depuis user_roles
  const passwordSet = user?.user_metadata?.password_set !== false;

  // If password not set, redirect to set password
  if (!passwordSet) {
    return <Navigate to="/set-password" replace />;
  }

  // If role restriction applies and user doesn't have permission
  if (allowedRoles.length > 0 && (!userAppRole || !allowedRoles.includes(userAppRole))) {
    return <Navigate to="/unauthorized" replace />;
  }

  // User is authenticated and authorized
  return <Outlet />;
};

export const RoleRedirect = () => {
  const { user, session, loading, userAppRole } = useAuthStore(); // Utilisez userRole du store

  // Show loading state while checking auth
  if (loading) {
    return null; // This will be handled by LoadingScreen in App.tsx
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  const passwordSet = user?.user_metadata?.password_set !== false;

  if (!passwordSet) {
    return <Navigate to="/set-password" replace />;
  }

  // Implement role-based redirection logic with userRole
  switch (userAppRole) {
    case 'superAdmin':
    case 'admin':
      return <Navigate to="/dashboard" replace />;
    case 'provider':
      return <Navigate to="/provider/profile" replace />;
    default:
      return <Navigate to="/unauthorized" replace />;
  }
};

// New SuperAdmin only protected route
export const SuperAdminRoute = () => {
  const { user, session, userAppRole } = useAuthStore(); // Utilisez userRole du store
  const location = useLocation();

  // If not authenticated, redirect to /auth
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  const passwordSet = user?.user_metadata?.password_set !== false;

  // If password not set, redirect to set password
  if (!passwordSet) {
    return <Navigate to="/set-password" replace />;
  }

  // Only allow superAdmin
  if (userAppRole !== 'superAdmin') {
    return <Navigate to="/unauthorized" replace />;
  }

  // User is authenticated and authorized as superAdmin
  return <Outlet />;
};
