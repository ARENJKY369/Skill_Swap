import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Compass, LibraryBig, CalendarClock, ShieldCheck, LogOut,
} from 'lucide-react';
import Logo from './Logo';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useToast } from '../lib/toastHook';
import { canAccessAdminPanel } from '@shared/rbac';

const NAV = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/matches', label: 'Matches', icon: Users },
  { to: '/app/explore', label: 'Explorer', icon: Compass },
  { to: '/app/resources', label: 'Resources', icon: LibraryBig },
  { to: '/app/sessions', label: 'Sessions', icon: CalendarClock },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const toast = useToast();

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* best effort */ }
    setUser(null);
    toast.info('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <aside className="app-sidebar w-60 shrink-0 bg-panel border-r border-line flex flex-col" aria-label="Primary navigation">
      <div className="h-12 flex items-center px-4 border-b border-line">
        <Logo size="sm" />
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end as boolean | undefined} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="sidebar-label">{label}</span>
          </NavLink>
        ))}
        {canAccessAdminPanel(user?.role) && (
          <NavLink to="/app/admin" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="sidebar-label">Admin Panel</span>
          </NavLink>
        )}
      </nav>
      <div className="p-2 border-t border-line">
        <div className="sidebar-label px-3 pb-1.5 text-2xs text-muted truncate" title={user?.email}>
          Signed in as <span className="text-ink font-medium">{user?.username}</span>
          {user?.demo && <span className="chip chip-amber ml-1.5 !text-[9px] !py-0">Demo account</span>}
        </div>
        <button onClick={logout} className="sidebar-item w-full text-left hover:!bg-red-500/10 hover:!text-red-300">
          <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  );
}
