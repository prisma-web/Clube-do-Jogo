import { NextResponse } from 'next/server';
import {
  parseNativeInstallationInput,
  parseNativeUnlinkInput,
  registerNativePushInstallation,
  unlinkNativePushInstallation,
} from '@/lib/push-native';
import { createClient } from '@/lib/supabase/server';

async function authenticatedClient() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? client : null;
}

export async function POST(request: Request) {
  const client = await authenticatedClient();
  if (!client) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  let input: ReturnType<typeof parseNativeInstallationInput>;
  try {
    input = parseNativeInstallationInput(await request.json(), process.env.EXPO_PROJECT_ID);
  } catch (error) {
    const unavailable = error instanceof Error && error.message === 'Native push is not configured.';
    return NextResponse.json(
      { error: unavailable ? 'Push nativo nao configurado.' : 'Dados invalidos.' },
      { status: unavailable ? 503 : 400 },
    );
  }
  try {
    return NextResponse.json(await registerNativePushInstallation(client, input));
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel registrar esta instalacao.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const client = await authenticatedClient();
  if (!client) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  let input: ReturnType<typeof parseNativeUnlinkInput>;
  try {
    input = parseNativeUnlinkInput(await request.json());
  } catch {
    return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
  }
  try {
    const unlinked = await unlinkNativePushInstallation(client, input.installationId, input.expoPushToken);
    return NextResponse.json({ unlinked });
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel desassociar esta instalacao.' }, { status: 500 });
  }
}
