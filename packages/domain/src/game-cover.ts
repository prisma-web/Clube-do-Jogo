const FALLBACK_COVER_URL = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80';

export function gameCoverUrl(imageUrl?: string | null): string {
  return imageUrl?.trim() ? imageUrl : FALLBACK_COVER_URL;
}
