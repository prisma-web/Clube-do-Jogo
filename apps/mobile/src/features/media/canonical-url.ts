import { getMobileSiteUrl } from '../../platform/config';

export function getCanonicalGameUrl(gameId: string): string | null {
  const base = getMobileSiteUrl();
  return base ? `${base}/jogos/${encodeURIComponent(gameId)}` : null;
}

export function getCanonicalProfileUrl(profileId: string): string | null {
  const base = getMobileSiteUrl();
  return base ? `${base}/perfil/${encodeURIComponent(profileId)}` : null;
}
