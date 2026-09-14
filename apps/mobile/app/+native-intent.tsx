import { captureNavIntent } from '@/lib/nav-intent';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  captureNavIntent(path);
  return path;
}
