import { useState, useSyncExternalStore } from 'react';
import { productUpdateStorageKey, type ProductUpdate } from '@clube-do-jogo/domain';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useApp } from '@/state/app-provider';
import { isProductUpdateAutoOpenEnabled } from '@/platform/config';
import { getProductUpdateReopenSignal, subscribeProductUpdateReopen } from './product-update-bus';
import { shouldShowProductUpdate } from './product-update-visibility';
import { useInstalledProductUpdate } from './use-installed-product-update';
import { ProductUpdateSheet } from './ProductUpdateSheet';

export function ProductUpdateGate() {
  const { userId } = useApp();
  const update = useInstalledProductUpdate();
  if (!userId || !update) return null;
  return <ProductUpdatePrompt update={update} />;
}

function ProductUpdatePrompt({ update }: { update: ProductUpdate }) {
  const [seen, setSeen, status] = usePersistentState(productUpdateStorageKey(update.id), false);
  const reopenSignal = useSyncExternalStore(subscribeProductUpdateReopen, getProductUpdateReopenSignal, getProductUpdateReopenSignal);
  const [closedSignal, setClosedSignal] = useState(-1);

  const visible = shouldShowProductUpdate({
    loading: status.loading,
    seen,
    reopenSignal,
    closedSignal,
    autoOpenEnabled: isProductUpdateAutoOpenEnabled(),
  });

  // Any dismissal counts as seen: closing on the first step must not auto-show it again.
  const dismiss = () => {
    setSeen(true);
    setClosedSignal(reopenSignal);
  };

  return (
    <ProductUpdateSheet
      update={update}
      visible={visible}
      onClose={dismiss}
      onFinish={dismiss}
    />
  );
}
