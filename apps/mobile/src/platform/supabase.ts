import { setupURLPolyfill } from 'react-native-url-polyfill';

setupURLPolyfill();

import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, DataSupabaseClient } from '@clube-do-jogo/data';
import { getSupabaseConfig } from './config';
import { nativeStorage } from './storage';

let mobileClient: DataSupabaseClient | null | undefined;

export function getMobileSupabaseClient(): DataSupabaseClient | null {
  if (mobileClient !== undefined) return mobileClient;
  const config = getSupabaseConfig();
  if (!config) {
    mobileClient = null;
    return mobileClient;
  }
  mobileClient = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: nativeStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return mobileClient;
}

function refreshForState(client: SupabaseClient, state: AppStateStatus) {
  if (state === 'active') client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
}

export function bindSupabaseAppState(client: SupabaseClient) {
  refreshForState(client, AppState.currentState);
  const subscription = AppState.addEventListener('change', state => refreshForState(client, state));
  return () => {
    subscription.remove();
    client.auth.stopAutoRefresh();
  };
}

export function resetMobileSupabaseClientForTests() {
  mobileClient = undefined;
}
