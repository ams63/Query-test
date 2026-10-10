// Pending invite code (from a query://invite/CODE or https://…/i/CODE link opened before signing up)
// and a polite, rate-limited "rate us" prompt at happy moments.
import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

const K_CODE = 'query_pending_invite';
const K_REVIEW = 'query_review_asked_at';
export const savePendingInvite = (code) => SecureStore.setItemAsync(K_CODE, String(code).toUpperCase()).catch(() => {});
export const takePendingInvite = async () => { const c = await SecureStore.getItemAsync(K_CODE).catch(() => null); if (c) SecureStore.deleteItemAsync(K_CODE).catch(() => {}); return c; };
export const peekPendingInvite = () => SecureStore.getItemAsync(K_CODE).catch(() => null);

// At most once every 60 days, only when the store supports it
export async function maybeAskForReview() {
  try {
    const last = Number(await SecureStore.getItemAsync(K_REVIEW)) || 0;
    if (Date.now() - last < 60 * 86400e3) return;
    if (!(await StoreReview.hasAction())) return;
    await SecureStore.setItemAsync(K_REVIEW, String(Date.now()));
    await StoreReview.requestReview();
  } catch { /* never block the user */ }
}
