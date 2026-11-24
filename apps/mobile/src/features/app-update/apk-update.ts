import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { availableUpdate, parseLatestRelease, resolveUpdateSource, type ApkAsset, type Update, type UpdateSource } from './release';
import { downloadPercent } from './update-flow';

// The versionName of the installed APK, read from the package manager. Constants.expoConfig.version
// comes from the config embedded with the JS bundle, which a build can produce with a different
// APP_VERSION than the one Gradle wrote into the manifest.
export const updateSource: UpdateSource | null = resolveUpdateSource({
  os: Platform.OS,
  apkUpdates: Constants.expoConfig?.extra?.apkUpdates,
  installedVersion: Application.nativeApplicationVersion,
});

/** Rejects when GitHub can't be reached or answers with an error. */
export async function checkForUpdate(source: UpdateSource): Promise<Update | null> {
  const response = await fetch(`https://api.github.com/repos/${source.repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub releases answered ${response.status}`);
  const release = parseLatestRelease(await response.json(), source.repo);
  return release && availableUpdate(release, source.installed);
}

const downloads = new Directory(Paths.cache, 'apk-update');

/**
 * Reuses a complete earlier download of the same asset, so a cancelled installer or granting the
 * "install unknown apps" permission doesn't cost another full download. Any other file is removed.
 */
export async function downloadApk(apk: ApkAsset, { signal, onProgress }: {
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}): Promise<File> {
  const target = new File(downloads, apk.name);
  if (target.exists && target.size === apk.size) return target;
  if (downloads.exists) downloads.delete();
  downloads.create({ intermediates: true });
  return File.downloadFileAsync(apk.url, target, {
    signal,
    onProgress: progress => onProgress(downloadPercent(progress, apk.size)),
  });
}

const FLAG_GRANT_READ_URI_PERMISSION = 0x1;

/**
 * Resolves when the installer returns to the app, which only happens when the member did not
 * install (a successful install replaces the running app). Falls back to the APK URL in the
 * browser when the installer can't be launched.
 */
export async function openInstaller(file: File, apk: ApkAsset): Promise<void> {
  try {
    await startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    await Linking.openURL(apk.url);
  }
}
