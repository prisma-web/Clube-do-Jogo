import { useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { checkForUpdate, downloadApk, openInstaller, updateSource } from './apk-update';
import { idleFlow, updateFlowReducer } from './update-flow';
import { AppUpdateSheet } from './AppUpdateSheet';

// Android may silently drop an activity started from the background, which would leave the
// installer promise pending. Wait for the app to be in front before opening it.
function whenActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise(resolve => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
  });
}

/** Offers a newer APK on every open of the Android production app. Any check failure shows nothing. */
export function AppUpdateGate() {
  const [flow, dispatch] = useReducer(updateFlowReducer, idleFlow);
  const download = useRef<AbortController | null>(null);
  // Bumped on every dismissal so a check that was already in flight can't reopen the modal.
  const dismissals = useRef(0);

  useEffect(() => {
    if (!updateSource) return;
    const source = updateSource;
    const check = () => {
      const startedAt = dismissals.current;
      checkForUpdate(source).then(update => {
        if (dismissals.current === startedAt) dispatch({ type: 'checked', update });
      }, () => {});
    };
    check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      subscription.remove();
      download.current?.abort();
      download.current = null;
    };
  }, []);

  if (!updateSource) return null;

  const accept = () => {
    if (flow.phase !== 'available' && flow.phase !== 'error') return;
    const { apk } = flow.update.release;
    download.current?.abort();
    const controller = new AbortController();
    download.current = controller;
    const current = () => download.current === controller;
    dispatch({ type: 'accepted' });
    downloadApk(apk, {
      signal: controller.signal,
      onProgress: percent => {
        if (current()) dispatch({ type: 'progressed', percent });
      },
    })
      .then(async file => {
        await whenActive();
        if (!current()) return;
        dispatch({ type: 'installerOpened' });
        await openInstaller(file, apk);
        if (current()) dispatch({ type: 'installerClosed' });
      })
      .catch(() => {
        if (current()) dispatch({ type: 'failed' });
      });
  };

  const dismiss = () => {
    download.current?.abort();
    download.current = null;
    dismissals.current += 1;
    dispatch({ type: 'dismissed' });
  };

  return <AppUpdateSheet flow={flow} onAccept={accept} onDismiss={dismiss} />;
}
