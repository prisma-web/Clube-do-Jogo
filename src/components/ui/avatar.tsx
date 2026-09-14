import { cn, initials } from '@/lib/utils';
import type { AvatarCrop } from '@/lib/types';
import { avatarImageStyle } from '@clube-do-jogo/domain';

export { DEFAULT_AVATAR_CROP, normalizeAvatarCrop, avatarImageStyle } from '@clube-do-jogo/domain';

export function Avatar({ src, name, crop, className }: { src?: string | null; name?: string | null; crop?: AvatarCrop | null; className?: string }) {
  return (
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-xs font-bold text-zinc-300', className)}>
      {src ? <img src={src} alt={name || 'Avatar'} style={avatarImageStyle(crop)} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
