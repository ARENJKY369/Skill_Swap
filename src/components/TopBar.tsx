import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, UserRound, CalendarClock, LogOut, Check, UserPlus, CalendarCheck2, Star, Info, AlertTriangle } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { relativeTime } from '../lib/format';

interface NotificationRow {
  id: string; title: string; body: string; kind: string; read: number; created_at: string;
}

const kindIcon: Record<string, typeof Info> = {
  request: UserPlus,
  invite: CalendarClock,
  reminder: CalendarCheck2,
  review: Star,
  moderation: AlertTriangle,
  info: Info,
};

export default function TopBar({ context }: { context: string }) {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const unread = useAppStore((s) => s.unreadCount);
  const setUnread = useAppStore((s) => s.setUnreadCount);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  const loadNotifs = async () => {
    try {
      const data = await api.get<{ notifications: NotificationRow[]; unread: number }>('/api/notifications');
      setNotifs(data.notifications.slice(0, 8));
      setUnread(data.unread);
    } catch { /* offline — keep last known */ }
  };

  useEffect(() => {
    void loadNotifs();
    const t = window.setInterval(loadNotifs, 6000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setNotifOpen(false); setAvatarOpen(false); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setNotifs((ns) => ns.map((n) => ({ ...n, read: 1 })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  const openNotif = async (n: NotificationRow) => {
    if (!n.read) {
      api.post(`/api/notifications/${n.id}/read`).catch(() => undefined);
      setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      setUnread(Math.max(0, unread - 1));
    }
    setNotifOpen(false);
    if (n.kind === 'invite' || n.kind === 'reminder') navigate('/app/sessions');
    else if (n.kind === 'request') navigate('/app/sessions?tab=requests');
  };

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* best effort */ }
    setUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-11 flex items-center justify-between gap-3 px-4 border-b border-line bg-panel shrink-0">
      <div className="flex items-center gap-2 text-2xs text-muted min-w-0">
        <span className="hidden sm:inline">Workspace</span>
        <span className="hidden sm:inline" aria-hidden="true">/</span>
        <span className="text-ink font-medium truncate">{context}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* notifications */}
        <div className="relative" ref={notifRef}>
          <button
            className="relative p-2 rounded text-muted hover:text-ink hover:bg-panel-raised transition-colors"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
          >
            <Bell size={16} strokeWidth={1.5} />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-[9px] font-bold text-[#062831] flex items-center justify-center num">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-[340px] z-30 bg-panel border border-line rounded-card shadow-pop overflow-hidden dialog-in" role="dialog" aria-label="Notifications">
              <div className="flex items-center justify-between px-3 py-2 border-b border-line">
                <span className="text-xs font-semibold">Notifications</span>
                <button onClick={markAllRead} className="text-2xs text-accent hover:text-cyan-300 flex items-center gap-1">
                  <Check size={11} /> Mark all read
                </button>
              </div>
              <div className="max-h-[380px] overflow-y-auto">
                {notifs.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted">Nothing yet. When a request arrives, it lands here.</p>
                )}
                {notifs.map((n) => {
                  const Icon = kindIcon[n.kind] ?? Info;
                  return (
                    <button
                      key={n.id}
                      onClick={() => void openNotif(n)}
                      className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 hover:bg-panel-raised border-b border-line/50 transition-colors"
                    >
                      <span className="mt-0.5 text-accent"><Icon size={14} strokeWidth={1.5} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label="Unread" />}
                          <span className="text-xs font-medium text-ink truncate">{n.title}</span>
                        </span>
                        <span className="block text-2xs text-muted leading-snug mt-0.5">{n.body}</span>
                        <span className="block text-[10px] text-muted/70 mt-1 num">{relativeTime(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* avatar menu */}
        <div className="relative" ref={avatarRef}>
          <button
            className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-panel-raised transition-colors"
            aria-haspopup="menu"
            aria-expanded={avatarOpen}
            onClick={() => setAvatarOpen((v) => !v)}
          >
            <Avatar name={user?.name ?? '?'} src={user?.avatar} size={26} />
            <ChevronDown size={13} className="text-muted" />
          </button>
          {avatarOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 z-30 bg-panel border border-line rounded-card shadow-pop overflow-hidden dialog-in" role="menu">
              <div className="px-3 py-2.5 border-b border-line">
                <p className="text-xs font-semibold text-ink truncate">{user?.name}</p>
                <p className="text-2xs text-muted truncate">{user?.email}</p>
                <span className={`chip mt-1.5 ${user?.role === 'admin' ? 'chip-teal' : 'chip-gray'}`}>{user?.role === 'admin' ? 'Administrator' : 'Student'}</span>
              </div>
              <button role="menuitem" className="w-full text-left px-3 py-2 text-xs hover:bg-panel-raised flex items-center gap-2" onClick={() => { setAvatarOpen(false); navigate('/app/profile'); }}>
                <UserRound size={13} /> Profile &amp; skills
              </button>
              <button role="menuitem" className="w-full text-left px-3 py-2 text-xs hover:bg-panel-raised flex items-center gap-2" onClick={() => { setAvatarOpen(false); navigate('/app/sessions'); }}>
                <CalendarClock size={13} /> My sessions
              </button>
              <button role="menuitem" className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 flex items-center gap-2 border-t border-line" onClick={logout}>
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
