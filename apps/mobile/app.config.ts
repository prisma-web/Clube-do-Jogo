import { relative } from 'node:path';
import type { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT ?? 'development';
const isDistributed = variant === 'preview' || variant === 'production';
const applicationId = process.env.EXPO_APPLICATION_ID || 'com.clubedojogo.mobile.dev';
const localHttp = process.env.EXPO_LOCAL_HTTP === '1';

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

const DEFAULT_VERSION = '0.1.0';

function parseVersion(raw: string): { version: string; versionCode: number } | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.exec(raw);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  return { version: raw, versionCode: major * 10000 + minor * 100 + patch };
}

if (!['development', 'preview', 'production'].includes(variant)) {
  throw new Error('APP_VARIANT deve ser development, preview ou production.');
}
if (isDistributed && !process.env.EXPO_APPLICATION_ID) {
  throw new Error('Defina EXPO_APPLICATION_ID antes de gerar preview ou produção.');
}
if (isDistributed && localHttp) {
  throw new Error('EXPO_LOCAL_HTTP só pode ser usado na variante development.');
}

const requestedVersion = parseVersion(process.env.APP_VERSION || DEFAULT_VERSION);
if (isDistributed && !requestedVersion) {
  throw new Error(`APP_VERSION deve ser X.Y.Z com minor e patch abaixo de 100; recebido "${process.env.APP_VERSION}".`);
}
const { version, versionCode } = requestedVersion ?? parseVersion(DEFAULT_VERSION)!;
const iosBuildNumber = process.env.IOS_BUILD_NUMBER || '1';
if (!/^[1-9]\d{0,8}$/.test(iosBuildNumber)) {
  throw new Error(`IOS_BUILD_NUMBER deve ser um inteiro positivo; recebido "${iosBuildNumber}".`);
}
const apkUpdates = variant === 'production' ? { repo: 'prisma-web/Clube-do-Jogo' } : null;
const productUpdatesReleases = variant === 'development' ? process.env.EXPO_PRODUCT_UPDATES_RELEASES_URL : undefined;
const productUpdates = productUpdatesReleases ? { releases: productUpdatesReleases } : null;

const geistMonoWeights = [[400, '400Regular'], [500, '500Medium'], [600, '600SemiBold'], [700, '700Bold'], [800, '800ExtraBold'], [900, '900Black']] as const;
const geistMonoFiles = geistMonoWeights.map(([weight, name]) => ({
  weight,
  path: relative(__dirname, require.resolve(`@expo-google-fonts/geist-mono/${name}/GeistMono_${name}.ttf`)),
}));

const config: ExpoConfig = {
  name: 'Clube do Jogo',
  slug: 'clube-do-jogo',
  version,
  scheme: 'clubedojogo',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'fingerprint' },
  updates: { enabled: false },
  ios: {
    supportsTablet: true,
    bundleIdentifier: applicationId,
    buildNumber: iosBuildNumber,
    config: { usesNonExemptEncryption: false },
    associatedDomains: [`webcredentials:${siteHost}`],
  },
  android: {
    package: applicationId,
    versionCode,
    ...(apkUpdates && { permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'] }),
  },
  plugins: [
    'expo-router',
    ['expo-dev-client', { addGeneratedScheme: !isDistributed }],
    './plugins/withUISceneLifecycle',
    './plugins/withReleaseSigning',
    './plugins/withNetworkTimeouts',
    ['expo-build-properties', { android: { usesCleartextTraffic: localHttp } }],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    ['expo-notifications', { defaultChannel: 'default', color: '#8b5cf6', enableBackgroundRemoteNotifications: false }],
    ['expo-image-picker', { photosPermission: 'Escolha imagens para suas anotações privadas.', cameraPermission: false, microphonePermission: false }],
    ['expo-font', {
      ios: { fonts: geistMonoFiles.map(file => file.path) },
      android: { fonts: [{ fontFamily: 'Geist Mono', fontDefinitions: geistMonoFiles }] },
    }],
    ['expo-splash-screen', { backgroundColor: '#0c0a13', image: './assets/icon.png' }],
  ],
  experiments: { typedRoutes: true },
  ...((apkUpdates || productUpdates) && { extra: { ...(apkUpdates && { apkUpdates }), ...(productUpdates && { productUpdates }) } }),
};

export default config;
