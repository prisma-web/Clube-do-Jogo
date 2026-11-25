export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface ApkAsset {
  readonly name: string;
  readonly url: string;
  readonly size: number;
}

export interface Release {
  readonly tag: string;
  readonly version: Semver;
  readonly notes: string;
  readonly apk: ApkAsset;
}

export interface Update {
  readonly installed: Semver;
  readonly release: Release;
}

export interface UpdateSource {
  readonly repo: string;
  readonly installed: Semver;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

export function parseSemver(raw: unknown): Semver | null {
  if (typeof raw !== 'string') return null;
  const match = SEMVER.exec(raw);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatSemver({ major, minor, patch }: Semver): string {
  return `${major}.${minor}.${patch}`;
}

export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  const difference = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  return difference === 0 ? 0 : difference > 0 ? 1 : -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseApkAsset(value: unknown, downloadPrefix: string): ApkAsset | null {
  if (!isRecord(value)) return null;
  const { name, browser_download_url: url, size } = value;
  if (typeof name !== 'string' || !name.toLowerCase().endsWith('.apk')) return null;
  if (typeof url !== 'string' || !url.startsWith(downloadPrefix)) return null;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null;
  return { name, url, size };
}

export function parseLatestRelease(json: unknown, repo: string): Release | null {
  if (!isRecord(json) || json.draft === true || json.prerelease === true) return null;
  const tag = json.tag_name;
  if (typeof tag !== 'string' || !tag.startsWith('v')) return null;
  const version = parseSemver(tag.slice(1));
  if (!version) return null;
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const downloadPrefix = `https://github.com/${repo}/releases/download/`;
  const apk = assets.map(asset => parseApkAsset(asset, downloadPrefix)).find(asset => asset !== null);
  if (!apk) return null;
  return { tag, version, notes: typeof json.body === 'string' ? json.body.trim() : '', apk };
}

export function availableUpdate(release: Release, installed: Semver): Update | null {
  return compareSemver(release.version, installed) > 0 ? { installed, release } : null;
}

export function resolveUpdateSource({ os, apkUpdates, installedVersion }: {
  os: string;
  apkUpdates: unknown;
  installedVersion: string | null;
}): UpdateSource | null {
  if (os !== 'android' || !isRecord(apkUpdates)) return null;
  const { repo } = apkUpdates;
  if (typeof repo !== 'string' || !REPO.test(repo)) return null;
  const installed = parseSemver(installedVersion);
  return installed ? { repo, installed } : null;
}
