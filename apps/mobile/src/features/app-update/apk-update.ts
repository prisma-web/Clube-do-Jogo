import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { availableUpdate, parseLatestRelease, resolveUpdateSource, type ApkAsset, type Update, type UpdateSource } from './release';
import { downloadPercent } from './update-flow';

export const updateSource: UpdateSource | null = resolveUpdateSource({
  os: Platform.OS,
  apkUpdates: Constants.expoConfig?.extra?.apkUpdates,
  installedVersion: Application.nativeApplicationVersion,
});

export async function checkForUpdate(source: UpdateSource): Promise<Update | null> {
  const response = await fetch(`https://api.github.com/repos/${source.repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub releases answered ${response.status}`);
  const release = parseLatestRelease(await response.json(), source.repo);
  return release && availableUpdate(release, source.installed);
}

const downloads = new Directory(Paths.cache, 'apk-update');

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
