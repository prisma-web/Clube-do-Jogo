import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowProductUpdate } from '../../apps/mobile/src/features/product-updates/product-update-visibility';

test('stays hidden while the seen flag is still hydrating', () => {
  assert.equal(shouldShowProductUpdate({ loading: true, seen: false, reopenSignal: 0, closedSignal: -1 }), false);
});

test('auto-shows once hydration confirms the update was never seen', () => {
  assert.equal(shouldShowProductUpdate({ loading: false, seen: false, reopenSignal: 0, closedSignal: -1 }), true);
});

test('never auto-shows again once the member finished the update', () => {
  assert.equal(shouldShowProductUpdate({ loading: false, seen: true, reopenSignal: 0, closedSignal: -1 }), false);
});

test('closing without finishing hides the sheet for the rest of the session', () => {
  const closedAfterDismiss = { loading: false, seen: false, reopenSignal: 0, closedSignal: 0 };
  assert.equal(shouldShowProductUpdate(closedAfterDismiss), false);
});

test('an explicit reopen request shows the sheet again after it was seen and closed', () => {
  const seenAndClosed = { loading: false, seen: true, reopenSignal: 0, closedSignal: 0 };
  assert.equal(shouldShowProductUpdate(seenAndClosed), false);

  const reopened = { ...seenAndClosed, reopenSignal: 1 };
  assert.equal(shouldShowProductUpdate(reopened), true);
});

test('closing the reopened sheet hides it again until the next reopen request', () => {
  const closedAfterReopen = { loading: false, seen: true, reopenSignal: 1, closedSignal: 1 };
  assert.equal(shouldShowProductUpdate(closedAfterReopen), false);

  const reopenedAgain = { ...closedAfterReopen, reopenSignal: 2 };
  assert.equal(shouldShowProductUpdate(reopenedAgain), true);
});

test('auto-shows when autoOpenEnabled is omitted, matching the pre-flag default', () => {
  assert.equal(shouldShowProductUpdate({ loading: false, seen: false, reopenSignal: 0, closedSignal: -1 }), true);
});

test('auto-show is suppressed when autoOpenEnabled is false', () => {
  const pending = { loading: false, seen: false, reopenSignal: 0, closedSignal: -1, autoOpenEnabled: false };
  assert.equal(shouldShowProductUpdate(pending), false);
});

test('an explicit reopen request still works while autoOpenEnabled is false', () => {
  const disabledAndSeen = { loading: false, seen: true, reopenSignal: 0, closedSignal: 0, autoOpenEnabled: false };
  assert.equal(shouldShowProductUpdate(disabledAndSeen), false);

  const reopenedWhileDisabled = { ...disabledAndSeen, reopenSignal: 1 };
  assert.equal(shouldShowProductUpdate(reopenedWhileDisabled), true);
});
