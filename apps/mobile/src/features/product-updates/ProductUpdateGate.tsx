import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { ProductUpdateDigest } from '@clube-do-jogo/domain';
import { resolvePersistentStateKey } from '@/hooks/use-persistent-state';
import { useApp } from '@/state/app-provider';
import { getIdentitySnapshot, subscribeIdentity } from '@/state/identity-scope';
import { nativeStorage } from '@/platform/storage';
import { isProductUpdateAutoOpenEnabled } from '@/platform/config';
import { useAutoModalTurn } from '@/features/auto-modal-turn';
import { getProductUpdateReopenSignal, publishProductUpdateDigest, subscribeProductUpdateReopen } from './product-update-bus';
import { shouldShowProductUpdate } from './product-update-visibility';
import { useInstalledProductUpdates } from './use-installed-product-update';
import { markProductUpdateSeen, readProductUpdateDigest, type InstalledProductUpdates } from './release-product-update';
import { ProductUpdateSheet } from './ProductUpdateSheet';

export function ProductUpdateGate() {
  const { userId } = useApp();
  const installed = useInstalledProductUpdates();
  if (!userId || !installed) return null;
  return <ProductUpdatePrompt installed={installed} />;
}

function ProductUpdatePrompt({ installed }: { installed: InstalledProductUpdates }) {
  const identity = useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentitySnapshot);
  const seenKey = useCallback(
    (key: string) => resolvePersistentStateKey(key, true, identity.userId, identity.isDemo, identity.sessionEpoch),
    [identity],
  );
  const [digest, setDigest] = useState<ProductUpdateDigest | null>(null);
  const reopenSignal = useSyncExternalStore(subscribeProductUpdateReopen, getProductUpdateReopenSignal, getProductUpdateReopenSignal);
  const [closedSignal, setClosedSignal] = useState(-1);

  useEffect(() => {
    let active = true;
    void readProductUpdateDigest(installed, nativeStorage, seenKey).then(next => {
      if (!active) return;
      setDigest(next);
      publishProductUpdateDigest(next);
    });
    return () => {
      active = false;
      publishProductUpdateDigest(null);
    };
  }, [installed, seenKey]);

  const visible = useAutoModalTurn('product-update', shouldShowProductUpdate({
    loading: digest === null,
    seen: !digest?.pending,
    reopenSignal,
    closedSignal,
    autoOpenEnabled: isProductUpdateAutoOpenEnabled(),
  }));

  if (!digest) return null;

  const dismiss = () => {
    void markProductUpdateSeen(digest, nativeStorage, seenKey).catch(() => {});
    setClosedSignal(reopenSignal);
  };

  return (
    <ProductUpdateSheet
      digest={digest}
      visible={visible}
      onClose={dismiss}
      onFinish={dismiss}
    />
  );
}
