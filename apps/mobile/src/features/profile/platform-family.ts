import type { UserPlatform } from '@clube-do-jogo/domain';

export type PlatformFamily = 'playstation' | 'xbox' | 'nintendo' | 'pc' | 'other';

export function platformFamily(platform: Pick<UserPlatform, 'name' | 'abbreviation'>): PlatformFamily {
  const value = `${platform.name} ${platform.abbreviation || ''}`.toLocaleLowerCase('pt-BR');
  if (/playstation|\bps[1-5]\b/.test(value)) return 'playstation';
  if (/xbox/.test(value)) return 'xbox';
  if (/nintendo|switch|wii|game boy|gamecube|3ds/.test(value)) return 'nintendo';
  if (/pc|windows|linux|mac/.test(value)) return 'pc';
  return 'other';
}

export const PLATFORM_FAMILY_COLORS: Record<PlatformFamily, string> = {
  playstation: '#4d8dff',
  xbox: '#65b94a',
  nintendo: '#ef5350',
  pc: '#a879ff',
  other: '#4dd2dd',
};
