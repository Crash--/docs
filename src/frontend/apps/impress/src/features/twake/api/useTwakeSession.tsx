import { useQuery } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import { gotoLogin } from '@/features/auth/utils';
import { safeSessionStorage } from '@/utils/storages';

/**
 * What the Twake bar and SDK need from the session: the id token of the SSO
 * and the address of the user's Workplace. Served by the twake app of the
 * Docs image.
 */
export interface TwakeSession {
  sub: string;
  id_token: string | null;
  workplace_fqdn: string | null;
}

/** The id token of the session has expired: a silent login brings a new one. */
export interface TwakeSessionRefresh {
  refresh_url: string;
}

export const getTwakeSession = async (): Promise<TwakeSession> => {
  const response = await fetchAPI(
    `twake/session/?${new URLSearchParams({ next: window.location.href })}`,
  );
  if (response.status === 401) {
    const body = (await response
      .json()
      .catch(() => null)) as Partial<TwakeSessionRefresh> | null;
    if (body?.refresh_url) {
      throw new APIError<TwakeSessionRefresh>('The id token has expired', {
        status: 401,
        data: { refresh_url: body.refresh_url },
      });
    }
  }
  if (!response.ok) {
    throw new APIError(
      `Couldn't fetch the Twake session: ${response.statusText}`,
      await errorCauses(response),
    );
  }
  return response.json() as Promise<TwakeSession>;
};

export const refreshURLOf = (error: unknown): string | null =>
  error instanceof APIError
    ? ((error.data as Partial<TwakeSessionRefresh> | undefined)?.refresh_url ??
      null)
    : null;

const RENEW_KEY = 'twake-session-renew';
const RENEW_WINDOW_MS = 60_000;

/**
 * Follows the silent login, once: when the page comes back from it still
 * without an id token, the session of the SSO itself has ended, and the
 * normal login page takes over.
 */
export const renewTwakeSession = (refreshURL: string) => {
  const last = Number(safeSessionStorage.getItem(RENEW_KEY) ?? 0);
  if (Date.now() - last < RENEW_WINDOW_MS) {
    // The login page of the SSO never shows in the frame of another app
    if (window.self !== window.top) {
      return;
    }
    safeSessionStorage.removeItem(RENEW_KEY);
    gotoLogin();
    return;
  }
  safeSessionStorage.setItem(RENEW_KEY, String(Date.now()));
  window.location.replace(refreshURL);
};

export const KEY_TWAKE_SESSION = 'twake-session';

export function useTwakeSession(enabled: boolean) {
  return useQuery<TwakeSession, APIError>({
    queryKey: [KEY_TWAKE_SESSION],
    queryFn: getTwakeSession,
    enabled,
    // Read once per page: the SDK then lives on its own token, and a renewal
    // must never navigate away from a document being edited
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
