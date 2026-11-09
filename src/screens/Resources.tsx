import { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, Video, ListChecks, GraduationCap, ExternalLink } from 'lucide-react';
import { api } from '../api/client';

const CATEGORIES = ['All', 'Tech', 'Arts', 'Languages', 'Business', 'Design'] as const;

interface ResourceRow {
  id: string; title: string; provider: string; url: string; skill: string;
  category: string; kind: 'guide' | 'video' | 'course' | 'exercise';
}

const kindIcon = { guide: BookOpen, video: Video, course: GraduationCap, exercise: ListChecks } as const;
const kindLabel = { guide: 'Guide', video: 'Video', course: 'Course', exercise: 'Exercise' } as const;

export default function Resources() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [rows, setRows] = useState<ResourceRow[] | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setRows(null);
      api.get<{ resources: ResourceRow[] }>(`/api/resources?q=${encodeURIComponent(q)}&category=${category}`)
        .then((d) => setRows(d.resources))
        .catch(() => setRows([]));
    }, 150);
    return () => window.clearTimeout(t);
  }, [q, category]);

  const grouped = useMemo(() => {
    if (!rows) return null;
    const map = new Map<string, ResourceRow[]>();
    for (const r of rows) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 max-w-[1000px] flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-md font-bold text-ink">Resource Library</h1>
            <p className="text-2xs text-muted mt-0.5">Curated, external learning material attached to catalog skills. Links open in a new tab.</p>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} />
            <input className="field !pl-8 !w-64" placeholder="Search resources…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search resources" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip transition-colors ${category === c ? 'chip-teal' : 'hover:text-ink'}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>

        {grouped === null ? (
          <div className="flex flex-col gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">No resources match. Clear the search or pick another category.</p>
        ) : (
          grouped.map(([cat, list]) => (
            <section key={cat} aria-label={cat}>
              <h2 className="text-2xs font-bold uppercase tracking-wider text-muted mb-1.5">{cat} <span className="num">· {list.length}</span></h2>
              <ul className="bg-panel border border-line rounded-card divide-y divide-line/60 overflow-hidden">
                {list.map((r) => {
                  const Icon = kindIcon[r.kind];
                  return (
                    <li key={r.id}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 hover:bg-panel-raised/60 transition-colors group">
                        <span className="p-1.5 rounded-input bg-inset border border-line text-accent"><Icon size={15} strokeWidth={1.5} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-ink truncate">{r.title}</span>
                          <span className="block text-[10px] text-muted mt-0.5">{r.provider} · {kindLabel[r.kind]}</span>
                        </span>
                        <span className="chip chip-gray !text-[10px] shrink-0">{r.skill}</span>
                        <ExternalLink size={12} className="text-muted group-hover:text-accent shrink-0 transition-colors" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
