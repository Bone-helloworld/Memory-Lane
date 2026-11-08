import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth.jsx';
import { FullPageLoading } from './States.jsx';

/** Where to go after logging in or signing up: back to the page that asked (e.g. an invite link), else Today. */
export function returnPath(location) {
  // Normally the page that sent us here; after a Google sign-in that did not work out, ?next= in the address (an invite…).
  const from = location.state?.from ?? new URLSearchParams(location.search).get('next');
  const inside = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\') && !from.startsWith('/api/');
  return inside ? from : '/today';
}

/** Pages behind login. Visitors are sent to /login and brought back afterwards. */
export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  return children;
}

/**
 * Login / register: pointless when already logged in. The moment a login or sign-up succeeds,
 * this guard re-renders first — so it must send the user to the same place the form would.
 */
export function GuestOnly() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <FullPageLoading />;
  if (user) return <Navigate to={returnPath(location)} replace />;
  return <Outlet />;
}
