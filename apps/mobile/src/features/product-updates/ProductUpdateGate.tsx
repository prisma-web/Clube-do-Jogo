import { useState, useSyncExternalStore } from 'react';
import { currentProductUpdate, productUpdateStorageKey } from '@clube-do-jogo/domain';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useApp } from '@/state/app-provider';
import { isProductUpdateAutoOpenEnabled } from '@/platform/config';
import { getProductUpdateReopenSignal, subscribeProductUpdateReopen } from './product-update-bus';
import { shouldShowProductUpdate } from './product-update-visibility';
import { ProductUpdateSheet } from './ProductUpdateSheet';

export function ProductUpdateGate() {
  const { userId } = useApp();
  const [seen, setSeen, status] = usePersistentState(productUpdateStorageKey(currentProductUpdate.id), false);
  const reopenSignal = useSyncExternalStore(subscribeProductUpdateReopen, getProductUpdateReopenSignal, getProductUpdateReopenSignal);
  const [closedSignal, setClosedSignal] = useState(-1);

  if (!userId) return null;

  const visible = shouldShowProductUpdate({
    loading: status.loading,
    seen,
    reopenSignal,
    closedSignal,
    autoOpenEnabled: isProductUpdateAutoOpenEnabled(),
  });

  return (
    <ProductUpdateSheet
      update={currentProductUpdate}
      visible={visible}
      onClose={() => setClosedSignal(reopenSignal)}
      onFinish={() => {
        setSeen(true);
        setClosedSignal(reopenSignal);
      }}
    />
  );
}
