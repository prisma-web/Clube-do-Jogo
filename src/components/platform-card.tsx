import { Gamepad2, Joystick, Monitor, RadioTower } from 'lucide-react';
import type { UserPlatform } from '@/lib/types';

function platformFamily(platform: UserPlatform) {
  const value = `${platform.name} ${platform.abbreviation || ''}`.toLocaleLowerCase('pt-BR');
  if (/playstation|\bps[1-5]\b/.test(value)) return 'playstation';
  if (/xbox/.test(value)) return 'xbox';
  if (/nintendo|switch|wii|game boy|gamecube|3ds/.test(value)) return 'nintendo';
  if (/pc|windows|linux|mac/.test(value)) return 'pc';
  return 'other';
}

export function PlatformCard({ platform }: { platform: UserPlatform }) {
  const family = platformFamily(platform);
  const FallbackIcon = family === 'pc' ? Monitor : family === 'nintendo' ? Joystick : family === 'other' ? RadioTower : Gamepad2;
  return (
    <article data-platform-family={family} className="platform-card relative flex min-h-32 min-w-0 flex-col justify-between overflow-hidden rounded-2xl border p-4">
      <span className="platform-card-glow pointer-events-none absolute -right-8 -top-10 size-28 rounded-full blur-2xl" />
      <div className="platform-card-icon relative grid size-12 place-items-center rounded-xl">
        {platform.logo_url
          ? <img src={platform.logo_url} alt="" className="max-h-8 max-w-9 object-contain" />
          : <FallbackIcon className="size-6" />}
      </div>
      <div className="relative mt-4 min-w-0">
        <strong className="block truncate text-sm">{platform.name}</strong>
        {platform.abbreviation && <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider opacity-55">{platform.abbreviation}</span>}
      </div>
    </article>
  );
}
