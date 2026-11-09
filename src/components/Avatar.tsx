import { initials, avatarHue } from '../lib/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  status?: 'online' | 'busy' | 'offline' | string | null;
  className?: string;
}

const dotColor: Record<string, string> = {
  online: '#22C55E',
  busy: '#F59E0B',
  offline: '#64748B',
};

export default function Avatar({ name, src, size = 36, status, className = '' }: AvatarProps) {
  const hue = avatarHue(name);
  const dot = status ? dotColor[status] ?? '#64748B' : null;
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={`${name}'s avatar`}
          width={size}
          height={size}
          className="rounded-full object-cover border border-line"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="rounded-full flex items-center justify-center border border-line font-semibold text-ink"
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.38),
            background: `hsl(${hue} 42% 30%)`,
          }}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
      )}
      {dot && (
        <span
          className="absolute rounded-full border-2 border-panel"
          style={{
            background: dot,
            width: Math.max(8, Math.round(size * 0.28)),
            height: Math.max(8, Math.round(size * 0.28)),
            right: -1,
            bottom: -1,
          }}
          aria-label={status ?? 'offline'}
          role="img"
        />
      )}
    </span>
  );
}
