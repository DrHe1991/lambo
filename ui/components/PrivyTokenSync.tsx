import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { registerPrivyLogout } from '../lib/privy';

/**
 * Bridge between BitLink and Privy's auth lifecycle. Two jobs:
 *
 * 1. Token sync — keep `localStorage['bitlink_access_token']` populated with
 *    the live Privy access token. Privy tokens are short-lived (~1h) and
 *    rotate on activity; `apiRequest` reads the token from localStorage, so
 *    we refresh it on a timer (and on auth state changes) to keep BitLink
 *    API calls authenticated.
 *
 * 2. Logout registration — exposes Privy's logout to the (non-React) userStore
 *    via lib/privy.runPrivyLogout. userStore.logout awaits this before
 *    finishing so LoginPage doesn't immediately re-link a still-authenticated
 *    Privy session.
 *
 * Must be rendered INSIDE <PrivyProvider>.
 */
export function PrivyTokenSync() {
  const { ready, authenticated, getAccessToken, logout: privyLogout } = usePrivy();

  // Token refresh loop.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      localStorage.removeItem('bitlink_access_token');
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const token = await getAccessToken();
        if (cancelled) return;
        if (token) {
          localStorage.setItem('bitlink_access_token', token);
        } else {
          localStorage.removeItem('bitlink_access_token');
        }
      } catch {
        /* let the next tick retry */
      }
    };

    void refresh();
    const id = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, authenticated, getAccessToken]);

  // Expose Privy.logout() to userStore.logout via the lib/privy module.
  useEffect(() => {
    registerPrivyLogout(privyLogout);
    return () => registerPrivyLogout(null);
  }, [privyLogout]);

  return null;
}
