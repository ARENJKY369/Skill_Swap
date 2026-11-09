import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Splash from './screens/Splash';
import AuthScreen from './screens/AuthScreen';
import Dashboard from './screens/Dashboard';
import ProfileScreen from './screens/ProfileScreen';
import Matchmaker from './screens/Matchmaker';
import Explorer from './screens/Explorer';
import Resources from './screens/Resources';
import SessionsScreen from './screens/SessionsScreen';
import AdminPanel from './screens/AdminPanel';
import LegalPage from './screens/LegalPage';
import AppShell from './components/AppShell';
import Toaster from './components/Toaster';
import { api } from './api/client';
import { useAppStore, type PublicUser } from './store/appStore';
import { canAccessAdminPanel } from '@shared/rbac';

/** Loads the current session once at boot. */
function useSessionBootstrap() {
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoaded = useAppStore((s) => s.setAuthLoaded);
  const authLoaded = useAppStore((s) => s.authLoaded);
  useEffect(() => {
    if (authLoaded) return;
    api.get<{ user: PublicUser }>('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoaded(true));
  }, [authLoaded, setUser, setAuthLoaded]);
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAppStore((s) => s.user);
  const authLoaded = useAppStore((s) => s.authLoaded);
  const location = useLocation();
  if (!authLoaded) return <Navigate to="/" replace state={{ from: location }} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.mustChangePassword) return <Navigate to="/login?mode=change-password" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const user = useAppStore((s) => s.user);
  if (!canAccessAdminPanel(user?.role)) return <Navigate to="/app/dashboard" replace />;
  return children;
}

export default function App() {
  useSessionBootstrap();
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<AuthScreen />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="matches" element={<Matchmaker />} />
          <Route path="explore" element={<Explorer />} />
          <Route path="resources" element={<Resources />} />
          <Route path="sessions" element={<SessionsScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
