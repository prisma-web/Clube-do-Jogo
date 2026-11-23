'use client';

import { useState } from 'react';
import { Award, Film, Gamepad2, Mic2, Sparkles, Trophy, Users } from 'lucide-react';
import type { GotyNomineeKind } from '@clube-do-jogo/domain';
import { cn } from '@/lib/utils';
import { TgaEmblem } from './tga-emblem';

const POSTER_PALETTES = [
  'from-[#261f12] via-[#131116] to-[#08080b]',
  'from-[#1e1a24] via-[#131018] to-[#08080b]',
  'from-[#251814] via-[#141012] to-[#08080b]',
  'from-[#131e22] via-[#101318] to-[#08080b]',
  'from-[#211d13] via-[#121216] to-[#08080b]',
  'from-[#1c1a15] via-[#111014] to-[#08080b]',
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function monogram(title: string): string {
  const words = title
    .replace(/[^a-zA-Z0-9À-ÿ\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '26';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function KindIcon({ kind, className }: { kind?: GotyNomineeKind; className?: string }) {
  if (kind === 'performance') return <Mic2 className={className} />;
  if (kind === 'adaptation') return <Film className={className} />;
  if (kind === 'creator') return <Sparkles className={className} />;
  if (kind === 'esports_athlete' || kind === 'esports_team') return <Trophy className={className} />;
  if (kind === 'user_creation') return <Users className={className} />;
  if (kind === 'game') return <Gamepad2 className={className} />;
  return <Award className={className} />;
}

export function GotyPosterArt({
  title,
  subtitle,
  imageUrl,
  kind = 'game',
  className,
  compact = false,
}: {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  kind?: GotyNomineeKind;
  className?: string;
  compact?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && failedUrl !== imageUrl);
  const palette = POSTER_PALETTES[hashString(title) % POSTER_PALETTES.length];

  if (showImage && imageUrl) {
    return (
      <div className={cn('relative overflow-hidden bg-[#0c0b10]', className)}>
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          className="size-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col justify-between overflow-hidden bg-gradient-to-br p-3 text-left',
        palette,
        className,
      )}
    >
      {/* Brilho dourado sutil de premiação */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(223,180,81,0.22),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-[inherit] border border-[#dfc06c]/15"
      />
      <TgaEmblem
        className={cn(
          'pointer-events-none absolute -right-3 -bottom-3 opacity-[0.09]',
          compact ? 'size-14' : 'size-24',
        )}
      />

      <div className="relative z-10 flex min-w-0 items-center justify-between gap-1">
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#dfc06c]/25 bg-black/45 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#efd58b]">
          <KindIcon kind={kind} className="size-2.5 shrink-0" />
          <span className="truncate">{compact ? '26' : 'TGA 26'}</span>
        </span>
      </div>

      <div className="relative z-10 my-auto min-w-0 w-full py-1">
        {!compact && (
          <div className="mb-1 text-[28px] font-black leading-none tracking-tighter text-[#dfc06c]/25 select-none">
            {monogram(title)}
          </div>
        )}
        <p
          className={cn(
            'w-full whitespace-normal break-words font-black leading-tight tracking-tight text-[#fbf5e3]',
            compact ? 'line-clamp-2 text-[11px]' : 'line-clamp-3 text-xs sm:text-sm',
          )}
        >
          {title}
        </p>
        {!compact && subtitle && (
          <p className="mt-1 line-clamp-2 w-full whitespace-normal break-words text-[10px] font-semibold leading-snug text-[#cbb98a]/80">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
