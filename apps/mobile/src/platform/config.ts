export const AUTH_CALLBACK_URL = 'clubedojogo://auth/callback';

// Expo only substitutes statically analyzable EXPO_PUBLIC_* references. Keep
// each environment lookup literal so release bundles receive configured values.
const expoSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const expoSupabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const expoSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const expoApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const expoApiUrl = process.env.EXPO_PUBLIC_API_URL;
const expoSiteUrl = process.env.EXPO_PUBLIC_SITE_URL;
const expoRankingFormula = process.env.EXPO_PUBLIC_RANKING_FORMULA;
const expoAutoOpenProductUpdate = process.env.EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE;

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

function environmentValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = environmentValue(expoSupabaseUrl);
  const publishableKey = environmentValue(expoSupabasePublishableKey, expoSupabaseAnonKey);
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
    return { url: parsed.toString().replace(/\/$/, ''), publishableKey };
  } catch {
    return null;
  }
}

export function getApiBaseUrl() {
  return environmentValue(expoApiBaseUrl, expoApiUrl);
}

export function getRankingFormula() {
  return environmentValue(expoRankingFormula) === 'legacy' ? 'legacy' as const : 'preference' as const;
}

export function isProductUpdateAutoOpenEnabled() {
  return environmentValue(expoAutoOpenProductUpdate) !== 'false';
}

export function getMobileSiteUrl(): string | null {
  const value = environmentValue(expoSiteUrl);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
