import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export {
  formatDate,
  formatDateTime,
  formatMonth,
  formatShortDate,
  formatTime,
  isPastMonth,
  monthKey,
  shiftMonth,
} from '@clube-do-jogo/domain';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function youtubeEmbedUrl(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const videoId = parsed.hostname.includes('youtu.be')
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop();
    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0` : null;
  } catch {
    return null;
  }
}

export function initials(name?: string | null) {
  return (name || 'Membro')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export function formatFinishedCount(count: number) {
  return `${count} ${count === 1 ? 'Finalizou' : 'Finalizaram'}`;
}
