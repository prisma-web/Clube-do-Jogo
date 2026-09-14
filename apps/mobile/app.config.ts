import type { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT ?? 'development';
const isDistributed = variant === 'preview' || variant === 'production';
const applicationId = process.env.EXPO_APPLICATION_ID || 'com.clubedojogo.mobile.dev';
const localHttp = process.env.EXPO_LOCAL_HTTP === '1';

// `webcredentials` só aceita um domínio: sem esquema, sem porta, e sob https.
// Retorna null em vez de lançar, senão uma variável mal formada derruba todo
// comando do Expo CLI, inclusive os testes que leem esta configuração.
function webcredentialsHost(raw: string | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.port) return null;
  if (!parsed.hostname.includes('.')) return null;
  return parsed.hostname;
}

const siteHost = webcredentialsHost(process.env.EXPO_PUBLIC_SITE_URL) ?? 'clube-do-jogo-coral.vercel.app';

if (!['development', 'preview', 'production'].includes(variant)) {
  throw new Error('APP_VARIANT deve ser development, preview ou production.');
}
if (isDistributed && !process.env.EXPO_APPLICATION_ID) {
  throw new Error('Defina EXPO_APPLICATION_ID antes de gerar preview ou produção.');
}
if (isDistributed && localHttp) {
  throw new Error('EXPO_LOCAL_HTTP só pode ser usado na variante development.');
}

const config: ExpoConfig = {
  name: 'Clube do Jogo',
  slug: 'clube-do-jogo',
  version: '0.1.0',
  scheme: 'clubedojogo',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'fingerprint' },
  updates: { enabled: false },
  ios: {
    supportsTablet: true,
    bundleIdentifier: applicationId,
    buildNumber: '1',
    // Deixa o Apple Passwords sugerir a credencial salva do site na tela de login
    // do app. Depende de /.well-known/apple-app-site-association estar no ar.
    associatedDomains: [`webcredentials:${siteHost}`],
  },
  android: {
    package: applicationId,
    versionCode: 1,
  },
  plugins: [
    'expo-router',
    // O expo-dev-client entra sozinho pelo autolinking; sem essa entrada explícita ele grava o
    // esquema exp+clube-do-jogo no Info.plist e no manifest também nas builds de loja, onde
    // o launcher nem está compilado. Manter a URL só no build de desenvolvimento.
    ['expo-dev-client', { addGeneratedScheme: !isDistributed }],
    // Ciclo de vida de UIScene: sem isso o app não lança quando compilado com o SDK do iOS 27.
    './plugins/withUISceneLifecycle',
    ['expo-build-properties', { android: { usesCleartextTraffic: localHttp } }],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    ['expo-notifications', { defaultChannel: 'default', color: '#8b5cf6', enableBackgroundRemoteNotifications: false }],
    ['expo-image-picker', { photosPermission: 'Escolha imagens para suas anotações privadas.', cameraPermission: false, microphonePermission: false }],
    ['expo-splash-screen', { backgroundColor: '#0c0a13', image: './assets/icon.png' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
