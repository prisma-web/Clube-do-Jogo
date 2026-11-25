import type { ApiRequestBody } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import {
  parseNativeInstallationInput,
  parseNativeUnlinkInput,
  registerNativePushInstallation,
  unlinkNativePushInstallation,
} from '@/lib/push-native';
import { createRequestContext } from '@/lib/supabase/server';

const registerJson = contractJson<'pushNativeRegister'>();
const unlinkJson = contractJson<'pushNativeUnlink'>();

async function authenticatedClient() {
  const { supabase, userId } = await createRequestContext({ checkRevocation: true });
  return userId ? supabase : null;
}

export async function POST(request: Request) {
  const client = await authenticatedClient();
  if (!client) return registerJson({ error: 'Nao autorizado.' }, { status: 401 });
  let input: ApiRequestBody<'pushNativeRegister'>;
  try {
    input = parseNativeInstallationInput(await request.json(), process.env.EXPO_PROJECT_ID);
  } catch (error) {
    const unavailable = error instanceof Error && error.message === 'Native push is not configured.';
    return registerJson(
      { error: unavailable ? 'Push nativo nao configurado.' : 'Dados invalidos.' },
      { status: unavailable ? 503 : 400 },
    );
  }
  try {
    return registerJson(await registerNativePushInstallation(client, input));
  } catch {
    return registerJson({ error: 'Nao foi possivel registrar esta instalacao.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const client = await authenticatedClient();
  if (!client) return unlinkJson({ error: 'Nao autorizado.' }, { status: 401 });
  let input: ApiRequestBody<'pushNativeUnlink'>;
  try {
    input = parseNativeUnlinkInput(await request.json());
  } catch {
    return unlinkJson({ error: 'Dados invalidos.' }, { status: 400 });
  }
  try {
    const unlinked = await unlinkNativePushInstallation(client, input.installationId, input.expoPushToken);
    return unlinkJson({ unlinked });
  } catch {
    return unlinkJson({ error: 'Nao foi possivel desassociar esta instalacao.' }, { status: 500 });
  }
}
