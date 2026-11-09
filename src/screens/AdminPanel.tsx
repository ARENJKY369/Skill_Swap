import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Flag, Tags, ScrollText, Download, ShieldCheck, ShieldOff,
  Trash2, ChevronLeft, ChevronRight, Search, Plus, UserRoundCog, HeartPulse,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Avatar from '../components/Avatar';
import Dialog from '../components/Dialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { api, ApiError } from '../api/client';
import { useToast } from '../lib/toastHook';

type AdminTab = 'overview' | 'users' | 'content' | 'categories' | 'logs';

interface Stats { totalUsers: number; students: number; newThisWeek: number; successfulMatchRate: number; completedSessions: number; reviews: number }
interface AdminUserRow { id: string; name: string; email: string; username: string; role: 'student' | 'admin'; major: string; status: string; restricted: number; demo: number; avg_rating: number; review_count: number; created_at: string }
interface AuditEntry { id: number; ts: string; actor_id: string | null; actor_name: string | null; action: string; ip: string | null; outcome: 'success' | 'failure' | 'denied' | 'info'; detail: string }
interface ReviewRow { id: string; overall: number; text: string; created_at: string; reviewer_name: string; reviewee_name: string; session_id: string }
interface AdminSkillRow { id: string; name: string; category: string; teach_count: number }

const OUTCOME_CHIP: Record<AuditEntry['outcome'], string> = {
  success: 'chip chip-green',
  failure: 'chip chip-red',
  denied: 'chip chip-amber',
  info: 'chip chip-gray',
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  const checkHealth = useCallback(async () => {
    try { await api.get('/api/health'); setDbOk(true); } catch { setDbOk(false); }
  }, []);
  useEffect(() => {
    void checkHealth();
    const t = window.setInterval(checkHealth, 30_000);
    return () => window.clearInterval(t);
  }, [checkHealth]);

  const SUBTABS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'content', label: 'Content', icon: Flag },
    { id: 'categories', label: 'Categories', icon: Tags },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ];

  return (
    <div className="h-full flex min-w-0">
      {/* admin sub-sidebar */}
      <aside className="w-44 shrink-0 border-r border-line bg-panel flex flex-col" aria-label="Admin sections">
        <div className="px-4 h-11 flex items-center border-b border-line">
          <span className="text-2xs font-bold uppercase tracking-widest text-teal-300">Admin Panel</span>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-0.5">
          {SUBTABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`sidebar-item ${tab === id ? 'active' : ''} w-full text-left`}
            >
              <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-label">{label}</span>
            </button>
          ))}
          <button className="sidebar-item w-full text-left" onClick={() => navigate('/app/profile')}>
            <UserRoundCog size={15} strokeWidth={1.5} aria-hidden="true" />
            <span className="sidebar-label">Profile</span>
          </button>
        </nav>
        <div className="p-2 border-t border-line">
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <HeartPulse size={12} className={dbOk === false ? 'text-red-400' : 'text-emerald-400'} aria-hidden="true" />
            <span className="text-2xs text-muted">{dbOk === null ? 'DB checking…' : dbOk ? 'DB connected' : 'DB unreachable'}</span>
            <span className={`w-1.5 h-1.5 rounded-full ml-auto ${dbOk === false ? 'bg-red-500' : 'bg-emerald-500'}`} aria-hidden="true" />
          </div>
          <p className="text-[9px] text-muted/70 px-3 leading-snug">All privileged actions are written to the audit log.</p>
        </div>
      </aside>

      {/* content area */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'content' && <ContentTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  );
}

/* ================= Overview ================= */

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [skill, setSkill] = useState('Java OOP');
  const [metricSkills, setMetricSkills] = useState<string[]>(['Java OOP']);
  const [points, setPoints] = useState<Array<{ day: string; matches: number; sessions: number }>>([]);
  const [recent, setRecent] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api.get<Stats>('/api/admin/stats').then(setStats).catch(() => undefined);
    api.get<{ entries: AuditEntry[] }>('/api/admin/audit?limit=6').then((d) => setRecent(d.entries)).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.get<{ points: Array<{ day: string; matches: number; sessions: number }>; skills: string[] }>(`/api/admin/metrics?skill=${encodeURIComponent(skill)}`)
      .then((d) => { setPoints(d.points); if (d.skills.length) setMetricSkills(d.skills); })
      .catch(() => setPoints([]));
  }, [skill]);

  const chartData = points.map((p) => ({ ...p, day: p.day.slice(5) }));

  return (
    <div className="p-4 flex flex-col gap-4 max-w-[1100px]">
      <div>
        <h1 className="text-md font-bold text-ink">Platform Overview</h1>
        <p className="text-2xs text-muted mt-0.5">Live counts from the SQLite store. Demo dataset — 16 accounts, zero seeded reviews.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Users" value={stats?.totalUsers} sub={`+${stats?.newThisWeek ?? 0} this week`} />
        <Kpi label="Students" value={stats?.students} sub="registered learners" />
        <div className="bg-panel border border-line rounded-card p-3.5">
          <p className="text-2xs uppercase tracking-wider text-muted font-semibold">Successful Match Rate</p>
          <p className="num text-[26px] leading-8 font-semibold text-ink mt-1">{stats ? `${stats.successfulMatchRate}%` : '—'}</p>
          <div className="h-1.5 bg-inset rounded-full overflow-hidden mt-1.5" role="progressbar" aria-valuenow={stats?.successfulMatchRate ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${stats?.successfulMatchRate ?? 0}%` }} />
          </div>
        </div>
        <Kpi label="Completed Sessions" value={stats?.completedSessions} sub={`${stats?.reviews ?? 0} reviews submitted`} />
      </div>

      <section className="bg-panel border border-line rounded-card p-4" aria-label="Engagement over time">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Engagement Over Time</h2>
          <label className="flex items-center gap-2 text-2xs text-muted">
            Metric for
            <select className="field !w-40" value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill selector">
              {metricSkills.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={24} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#F8FAFC', fontFamily: 'JetBrains Mono' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="matches" name="Match requests" stroke="#06B6D4" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="sessions" name="Sessions held" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="5 3" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-panel border border-line rounded-card overflow-hidden">
        <div className="px-4 h-9 flex items-center border-b border-line">
          <h2 className="text-xs font-bold uppercase tracking-wider">Recent Audit Events</h2>
        </div>
        <ul className="divide-y divide-line/50">
          {recent.length === 0 && <li className="px-4 py-4 text-2xs text-muted">No audit events yet.</li>}
          {recent.map((e) => (
            <li key={e.id} className="px-4 py-2 flex items-center gap-3 text-2xs">
              <span className={OUTCOME_CHIP[e.outcome]}>{e.outcome}</span>
              <span className="num text-muted w-36 shrink-0">{new Date(e.ts.replace(' ', 'T') + (e.ts.includes('Z') ? '' : 'Z')).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className="text-ink font-medium">{e.action}</span>
              <span className="text-muted truncate">{e.actor_name ?? 'system'}{e.detail ? ` — ${e.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value?: number; sub: string }) {
  return (
    <div className="bg-panel border border-line rounded-card p-3.5">
      <p className="text-2xs uppercase tracking-wider text-muted font-semibold">{label}</p>
      <p className="num text-[26px] leading-8 font-semibold text-ink mt-1">{value === undefined ? '—' : value.toLocaleString()}</p>
      <p className="text-[10px] text-muted">{sub}</p>
    </div>
  );
}

/* ================= Users ================= */

function UsersTab() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminUserRow[]; total: number; pageSize: number } | null>(null);
  const [modifyTarget, setModifyTarget] = useState<AdminUserRow | null>(null);
  const [modifyRole, setModifyRole] = useState<'student' | 'admin'>('student');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ users: AdminUserRow[]; total: number; pageSize: number }>(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`)
      .then(setData)
      .catch(() => setData({ users: [], total: 0, pageSize: 12 }));
  }, [q, page]);

  useEffect(() => {
    const t = window.setTimeout(load, 200);
    return () => window.clearTimeout(t);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const modify = async () => {
    if (!modifyTarget) return;
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${modifyTarget.id}`, { action: 'setRole', role: modifyRole });
      toast.success('Role updated', 'Privilege change audit-logged; sessions rotated.');
      setModifyTarget(null);
      load();
    } catch (err) {
      toast.error('Modify failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const toggleRestrict = async (u: AdminUserRow) => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { action: u.restricted ? 'unrestrict' : 'restrict' });
      toast.success(u.restricted ? 'Account restored' : 'Account restricted');
      load();
    } catch (err) {
      toast.error('Action failed', err instanceof ApiError ? err.message : undefined);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/users/${deleteTarget.id}`);
      toast.success('Account deleted', deleteTarget.name);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 max-w-[1100px]">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-md font-bold text-ink">Manage Students &amp; Tags</h1>
          <p className="text-2xs text-muted mt-0.5">Role changes, restrictions and deletions are audit-logged. Privilege changes rotate sessions.</p>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} />
          <input className="field !pl-8 !w-56" placeholder="Search name, email, handle…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search users" />
        </div>
      </div>

      <div className="bg-panel border border-line rounded-card overflow-hidden">
        <table className="data-table" aria-label="Students and roles">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Rating</th><th>Flags</th><th>Action</th></tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={u.name} size={30} status={u.status} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{u.name}</p>
                      <p className="text-[10px] text-muted truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td><span className={u.role === 'admin' ? 'chip chip-teal' : 'chip chip-gray'}>{u.role}</span></td>
                <td><span className="flex items-center gap-1.5 text-2xs text-muted"><span className="w-2 h-2 rounded-full" style={{ background: u.status === 'online' ? 'var(--success)' : u.status === 'busy' ? 'var(--warning)' : '#64748B' }} />{u.status}</span></td>
                <td className="num text-2xs text-muted">{u.review_count > 0 ? `${u.avg_rating.toFixed(1)} ★ (${u.review_count})` : 'No reviews yet'}</td>
                <td>
                  <div className="flex gap-1">
                    {u.demo === 1 && <span className="chip chip-amber !text-[9px]">Demo account</span>}
                    {u.restricted === 1 && <span className="chip chip-red !text-[9px]">Restricted</span>}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <button className="btn btn-subtle !py-1 text-2xs" onClick={() => { setModifyTarget(u); setModifyRole(u.role); }}>Modify</button>
                    <button className="btn btn-ghost !py-1 text-2xs" onClick={() => void toggleRestrict(u)}>
                      {u.restricted === 1 ? <><ShieldCheck size={11} /> Unrestrict</> : <><ShieldOff size={11} /> Restrict</>}
                    </button>
                    <button className="btn btn-danger !py-1 text-2xs" onClick={() => setDeleteTarget(u)}><Trash2 size={11} /> Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.users.length === 0 && (
              <tr><td colSpan={6} className="text-center text-2xs text-muted py-6">No users match “{q}”.</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 h-10 border-t border-line">
          <span className="text-2xs text-muted num">{data?.total ?? 0} account{(data?.total ?? 0) === 1 ? '' : 's'} · page {page}/{totalPages}</span>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded text-muted hover:text-ink disabled:opacity-30" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
            <button className="p-1.5 rounded text-muted hover:text-ink disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {modifyTarget && (
        <Dialog
          title="Modify account"
          subtitle={`${modifyTarget.name} — role change rotates all their sessions`}
          onClose={() => setModifyTarget(null)}
          width={400}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setModifyTarget(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void modify()} disabled={busy}>Apply change</button>
            </div>
          }
        >
          <label className="label" htmlFor="role-select">Role</label>
          <select id="role-select" className="field" value={modifyRole} onChange={(e) => setModifyRole(e.target.value as 'student' | 'admin')}>
            <option value="student">student</option>
            <option value="admin">admin</option>
          </select>
          <p className="text-2xs text-muted mt-2">Privilege shifts are written to the audit log with your admin identity and this session’s IP.</p>
        </Dialog>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete account"
          message={`Permanently delete ${deleteTarget.name} (${deleteTarget.email})? Their sessions, reviews and requests are removed. This is audit-logged and cannot be undone.`}
          confirmLabel="Delete account"
          danger
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ================= Content (review moderation) ================= */

function ContentTab() {
  const toast = useToast();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReviewRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ reviews: ReviewRow[] }>('/api/admin/reviews').then((d) => setReviews(d.reviews)).catch(() => setReviews([]));
  }, []);
  useEffect(load, [load]);

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/reviews/${deleteTarget.id}`);
      toast.success('Review removed', 'The author’s rating was recalculated.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error('Remove failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 max-w-[1100px]">
      <div>
        <h1 className="text-md font-bold text-ink">Content Moderation</h1>
        <p className="text-2xs text-muted mt-0.5">Reviews posted by users. Removing one recalculates the reviewee’s public average. Seeded reviews: none.</p>
      </div>
      <div className="bg-panel border border-line rounded-card overflow-hidden">
        <table className="data-table" aria-label="Review moderation queue">
          <thead><tr><th>Review</th><th>Overall</th><th>Posted</th><th>Action</th></tr></thead>
          <tbody>
            {reviews === null && <tr><td colSpan={4}><div className="skeleton h-10 m-2" /></td></tr>}
            {reviews?.length === 0 && <tr><td colSpan={4} className="text-center text-2xs text-muted py-6">No reviews yet. Verified-session reviews will appear here for moderation.</td></tr>}
            {reviews?.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="text-2xs"><span className="text-ink font-medium">{r.reviewer_name}</span><span className="text-muted"> → </span><span className="text-ink font-medium">{r.reviewee_name}</span></p>
                  {r.text && <p className="text-2xs text-muted mt-0.5 max-w-md line-clamp-2">“{r.text}”</p>}
                </td>
                <td className="num text-xs text-amber-300">{r.overall} ★</td>
                <td className="num text-2xs text-muted">{new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</td>
                <td><button className="btn btn-danger !py-1 text-2xs" onClick={() => setDeleteTarget(r)}><Trash2 size={11} /> Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="Remove review"
          message={`Remove ${deleteTarget.reviewer_name}'s review of ${deleteTarget.reviewee_name}? This is audit-logged.`}
          confirmLabel="Remove review"
          danger
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ================= Categories ================= */

function CategoriesTab() {
  const toast = useToast();
  const [skills, setSkills] = useState<AdminSkillRow[] | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'Tech' | 'Arts' | 'Languages' | 'Business' | 'Design'>('Tech');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ skills: AdminSkillRow[] }>('/api/admin/skills').then((d) => setSkills(d.skills)).catch(() => setSkills([]));
  }, []);
  useEffect(load, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminSkillRow[]>();
    for (const s of skills ?? []) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skills]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/admin/skills', { name: name.trim(), category });
      toast.success('Skill added', `${name.trim()} → ${category}`);
      setName('');
      load();
    } catch (err) {
      toast.error('Could not add skill', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 max-w-[1100px]">
      <h1 className="text-md font-bold text-ink">Skill Categories</h1>
      <form className="flex items-end gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="flex-1 min-w-44">
          <label className="label" htmlFor="new-skill">New skill</label>
          <input id="new-skill" className="field" placeholder="e.g. Rust Systems" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="new-skill-cat">Category</label>
          <select id="new-skill-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {['Tech', 'Arts', 'Languages', 'Business', 'Design'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}><Plus size={14} strokeWidth={2} /> Add skill</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {grouped.map(([cat, list]) => (
          <section key={cat} className="bg-panel border border-line rounded-card overflow-hidden">
            <div className="px-3 h-9 flex items-center justify-between border-b border-line">
              <h2 className="text-2xs font-bold uppercase tracking-wider">{cat}</h2>
              <span className="chip chip-gray num">{list.length}</span>
            </div>
            <ul className="max-h-72 overflow-y-auto divide-y divide-line/50">
              {list.map((s) => (
                <li key={s.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-2xs hover:bg-panel-raised/50">
                  <span className="text-ink">{s.name}</span>
                  <span className="num text-muted" title="Students teaching this">{s.teach_count}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {skills === null && <div className="skeleton h-40" />}
      </div>
    </div>
  );
}

/* ================= Logs ================= */

function LogsTab() {
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failure' | 'denied' | 'info'>('all');
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  const load = useCallback(() => {
    api.get<{ entries: AuditEntry[] }>(`/api/admin/audit?q=${encodeURIComponent(q)}&outcome=${outcome}&limit=200`)
      .then((d) => setEntries(d.entries))
      .catch(() => setEntries([]));
  }, [q, outcome]);

  // live-updating while the tab is open
  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const exportCsv = () => {
    const rows = entries ?? [];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'id,ts,actor,action,outcome,ip,detail',
      ...rows.map((e) => [e.id, e.ts, e.actor_name ?? e.actor_id ?? 'system', e.action, e.outcome, e.ip ?? '', e.detail].map(escape).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skillswap-audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 flex flex-col gap-3 max-w-[1100px]">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-md font-bold text-ink">System Activity Audit Log</h1>
          <p className="text-2xs text-muted mt-0.5">Logins, failures, privilege shifts, moderation and denied access. Live — refreshes every 5s.</p>
        </div>
        <button className="btn btn-subtle !py-1.5 text-2xs" onClick={exportCsv} disabled={!entries?.length}><Download size={12} /> Export CSV</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} />
          <input className="field !pl-8" placeholder="Filter by action, actor, IP, detail…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter audit log" />
        </div>
        <select className="field !w-36" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label="Outcome filter">
          {['all', 'success', 'failure', 'denied', 'info'].map((o) => <option key={o} value={o}>{o === 'all' ? 'All outcomes' : o}</option>)}
        </select>
      </div>

      <div className="bg-[#0B1220] border border-line rounded-card overflow-hidden">
        <div className="max-h-[520px] overflow-y-auto" role="log" aria-label="Audit log entries" aria-live="polite">
          <table className="w-full font-mono text-[11px] leading-5">
            <tbody>
              {entries === null && <tr><td className="p-3"><div className="skeleton h-6" /></td></tr>}
              {entries?.length === 0 && <tr><td className="p-4 text-center text-muted">No entries match.</td></tr>}
              {entries?.map((e) => (
                <tr key={e.id} className="border-b border-line/40 hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{e.ts.replace('T', ' ').slice(0, 19)}</td>
                  <td className="px-2 py-1.5"><span className={OUTCOME_CHIP[e.outcome]}>{e.outcome}</span></td>
                  <td className="px-2 py-1.5 text-cyan-200 whitespace-nowrap">{e.action}</td>
                  <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{e.actor_name ?? 'system'}</td>
                  <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{e.ip ?? '—'}</td>
                  <td className="px-2 py-1.5 text-slate-400 max-w-[280px] truncate" title={e.detail}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 h-8 flex items-center justify-between border-t border-line text-[10px] text-muted">
          <span className="num">{entries?.length ?? 0} entries</span>
          <span>Retention: 12 months · export for compliance</span>
        </div>
      </div>
    </div>
  );
}
