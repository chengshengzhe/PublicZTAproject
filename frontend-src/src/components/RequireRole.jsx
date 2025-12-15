import { Navigate } from 'react-router-dom';
import useRoles from '../hooks/useRoles';

export default function RequireRole({ allow, children }) {
  const roles = useRoles();
  const ok = allow.some(r => roles.includes(r));
  return ok ? children : <Navigate to="/" replace />;
}
