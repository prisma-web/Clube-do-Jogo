import { createMobileApiTransport } from './api';
import { getMobileSupabaseClient } from './supabase';

export type MobileApiTransport = ReturnType<typeof createMobileApiTransport>;

let mobileTransport: MobileApiTransport | undefined;

/** Transporte autenticado (Bearer) compartilhado para as rotas /api do servidor. */
export function getMobileApiTransport(): MobileApiTransport {
  mobileTransport ||= createMobileApiTransport(getMobileSupabaseClient());
  return mobileTransport;
}
