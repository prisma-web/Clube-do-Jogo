import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createExpoPushTransport,
  createSupabaseNativePushStore,
  runNativePushWorker,
} from '@/lib/push-native';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length
    && timingSafeEqual(Uint8Array.from(provided), Uint8Array.from(expected));
}

async function work(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  if (!process.env.EXPO_PROJECT_ID) {
    return NextResponse.json({ error: 'Push nativo nao configurado.' }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase nao configurado.' }, { status: 503 });
  try {
    const workerId = randomUUID();
    const result = await runNativePushWorker(
      createSupabaseNativePushStore(admin, workerId),
      createExpoPushTransport(),
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel processar o push nativo.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return work(request);
}

export async function POST(request: Request) {
  return work(request);
}
