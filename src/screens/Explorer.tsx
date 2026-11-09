import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, Star, X, UserPlus, GraduationCap, Building2, CalendarDays, BadgeCheck, SlidersHorizontal,
} from 'lucide-react';
import Avatar from '../components/Avatar';
import ScheduleSessionDialog from '../components/ScheduleSessionDialog';
import { api } from '../api/client';
import { useToast } from '../lib/toastHook';
import { sanitizeHtml } from '../lib/sanitize';
import type { PublicUser } from '../store/appStore';

const CATEGORIES = ['All', 'Tech', 'Arts', 'Languages', 'Business', 'Design'] as const;

interface ReviewRow {
  id: string; punctuality: number; clarity: number; engagement: number; overall: number;
  text: string; created_at: string; reviewer_name: string; reviewer_username: string;
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={1.5}
          className={value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : 'text-slate-600'} aria-hidden="true" />
      ))}
    </span>
  );
}

export default function Explorer() {
  const location = useLocation();
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [quickSessionFor, setQuickSessionFor] = useState<PublicUser | null>(null);

  // focus search when arriving via Ctrl+K
  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [location.state]);

  // debounce search 150ms
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q: debounced, category, limit: '48' });
    setUsers(null);
    api.get<{ users: PublicUser[] }>(`/api/users/explorer?${params}`)
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, [debounced, category]);

  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!users) return null;
    return users.filter((u) => {
      if (onlineOnly && u.status !== 'online') return false;
      if (topRated && !(u.reviewCount > 0 && u.avgRating >= 4.5)) return false;
      return true;
    });
  }, [users, onlineOnly, topRated]);

  const openDrawer = (u: PublicUser) => {
    setSelected(u);
    setReviews(null);
    api.get<{ reviews: ReviewRow[] }>(`/api/reviews?userId=${encodeURIComponent(u.id)}`)
      .then((d) => setReviews(d.reviews))
      .catch(() => setReviews([]));
  };

  // Escape closes the drawer
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const connect = async (u: PublicUser) => {
    try {
      await api.post(`/api/users/${u.id}/connect`, { skill: u.teaches[0], message: '' });
      setRequested((prev) => new Set(prev).add(u.id));
      toast.success('Connection request sent', `${u.name} will be notified.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the request';
      toast.error('Request not sent', msg);
      if (msg.toLowerCase().includes('already')) setRequested((prev) => new Set(prev).add(u.id));
    }
  };

  return (
    <div className="h-full flex flex-col min-w-0 relative">
      {/* toolbar */}
      <div className="px-4 pt-4 pb-2 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-md font-bold text-ink">Global Skill Explorer</h1>
            <p className="text-2xs text-muted mt-0.5">Every student, every skill. Debounced search, category filter.</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
            <input
              ref={searchRef}
              className="field !pl-9 w-[280px]"
              placeholder="Search for skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search for skills"
            />
            {query && (
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal size={12} className="text-muted" aria-hidden="true" />
          <label className="sr-only" htmlFor="explorer-category">Category</label>
          <select id="explorer-category" className="field !w-32" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          {(['All', ...CATEGORIES.slice(1)] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`chip transition-colors ${category === c ? 'chip-teal' : 'hover:text-ink hover:border-slate-500'}`}
            >
              {c}
            </button>
          ))}
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <button className={`chip transition-colors ${onlineOnly ? 'chip-green' : 'hover:text-ink'}`} aria-pressed={onlineOnly} onClick={() => setOnlineOnly((v) => !v)}>
            Online now
          </button>
          <button className={`chip transition-colors ${topRated ? 'chip-amber' : 'hover:text-ink'}`} aria-pressed={topRated} onClick={() => setTopRated((v) => !v)}>
            4.5+ rated
          </button>
        </div>
      </div>

      {/* card grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {visible === null ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-card" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted">No students match {debounced ? <>“{debounced}”</> : 'these filters'}.</p>
            <button className="btn btn-ghost !py-1.5 text-xs mt-3" onClick={() => { setQuery(''); setCategory('All'); setOnlineOnly(false); setTopRated(false); }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visible.map((u) => (
              <article key={u.id} className="bg-panel border border-line rounded-card p-3 flex flex-col gap-2 hover:border-slate-500 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.name} src={u.avatar} size={40} status={u.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate leading-tight">{u.name}</p>
                    <p className="text-[10px] text-muted truncate">@{u.username}</p>
                    <p className="text-[10px] text-muted num mt-0.5">
                      {u.reviewCount > 0 ? <>{u.avgRating.toFixed(1)} ★ · {u.reviewCount} review{u.reviewCount === 1 ? '' : 's'}</> : 'No reviews yet'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 min-h-[24px]">
                  {u.teaches.slice(0, 1).map((s) => <span key={s} className="chip chip-teal !text-[10px]">{s}</span>)}
                  {u.teaches.slice(1, 3).map((s) => <span key={s} className="chip chip-gray !text-[10px]">{s}</span>)}
                  {u.teaches.length > 3 && <span className="chip chip-gray !text-[10px]">+{u.teaches.length - 3}</span>}
                </div>
                <button className="btn btn-subtle !py-1.5 text-2xs w-full justify-center mt-auto" onClick={() => openDrawer(u)}>
                  View Profile
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* side drawer */}
      {selected && (
        <div className="absolute inset-0 z-20 flex justify-end" role="presentation">
          <div className="absolute inset-0 bg-[#020617]/55 fade-in" onClick={() => setSelected(null)} aria-hidden="true" />
          <aside
            className="relative w-[420px] max-w-full h-full bg-panel border-l border-line flex flex-col dialog-in shadow-pop"
            role="dialog"
            aria-modal="true"
            aria-label={`Profile of ${selected.name}`}
          >
            <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Student Profile</span>
              <button className="p-1.5 rounded text-muted hover:text-ink hover:bg-panel-raised" onClick={() => setSelected(null)} aria-label="Close profile">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <Avatar name={selected.name} src={selected.avatar} size={84} status={selected.status} />
                <div className="min-w-0">
                  <p className="text-md font-bold text-ink">{selected.name}</p>
                  <p className="text-2xs text-muted">@{selected.username}</p>
                  <p className="text-2xs text-muted flex items-center gap-2 mt-1.5">
                    <GraduationCap size={11} /> {selected.major || 'Undeclared'}
                  </p>
                  <p className="text-2xs text-muted flex items-center gap-2 mt-0.5">
                    <Building2 size={11} /> {selected.university || 'Unknown university'}
                  </p>
                  <p className="text-2xs text-muted flex items-center gap-2 mt-0.5">
                    <CalendarDays size={11} /> {selected.year || '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 border border-line rounded-input bg-inset px-3 py-2">
                {selected.reviewCount > 0 ? (
                  <>
                    <span className="num text-lg font-bold text-ink">{selected.avgRating.toFixed(1)}</span>
                    <Stars value={selected.avgRating} size={14} />
                    <span className="text-2xs text-muted">· {selected.reviewCount} verified review{selected.reviewCount === 1 ? '' : 's'}</span>
                  </>
                ) : (
                  <span className="text-2xs text-muted">No reviews yet — be the first after a verified session.</span>
                )}
              </div>

              {selected.bio && (
                <div>
                  <h3 className="label">Bio</h3>
                  <p className="text-xs text-ink/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.bio) }} />
                </div>
              )}

              <div>
                <h3 className="label">Teaches</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.teaches.map((s) => <span key={s} className="chip chip-teal !text-[10px]">{s}</span>)}
                  {selected.teaches.length === 0 && <span className="text-2xs text-muted">Nothing listed yet.</span>}
                </div>
              </div>
              <div>
                <h3 className="label">Wants to learn</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.wants.map((s) => <span key={s} className="chip chip-gray !text-[10px]">{s}</span>)}
                  {selected.wants.length === 0 && <span className="text-2xs text-muted">Nothing listed yet.</span>}
                </div>
              </div>

              <div>
                <h3 className="label">Recent reviews</h3>
                {reviews === null ? (
                  <div className="flex flex-col gap-2">{[1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
                ) : reviews.length === 0 ? (
                  <p className="text-2xs text-muted border border-dashed border-line rounded-input px-3 py-3">No reviews yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {reviews.slice(0, 4).map((r) => (
                      <li key={r.id} className="border border-line rounded-input p-2.5 bg-inset">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xs font-semibold text-ink">{r.reviewer_name}</span>
                          <Stars value={r.overall} size={11} />
                        </div>
                        {r.text && <p className="text-2xs text-muted mt-1 leading-snug">{r.text}</p>}
                        <p className="text-[9px] text-teal-300/80 mt-1.5 flex items-center gap-1"><BadgeCheck size={9} /> Verified session · {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-line flex items-center gap-2 shrink-0">
              <button className="btn btn-primary flex-1 justify-center" onClick={() => void connect(selected)} disabled={requested.has(selected.id)}>
                <UserPlus size={14} strokeWidth={1.75} />
                {requested.has(selected.id) ? 'Request sent' : 'Connect & Learn'}
              </button>
              <button className="btn btn-ghost" onClick={() => setQuickSessionFor(selected)}>Quick Session</button>
            </div>
          </aside>
        </div>
      )}

      {quickSessionFor && (
        <ScheduleSessionDialog
          prefill={{ recipientId: quickSessionFor.id }}
          onClose={() => setQuickSessionFor(null)}
        />
      )}
    </div>
  );
}
