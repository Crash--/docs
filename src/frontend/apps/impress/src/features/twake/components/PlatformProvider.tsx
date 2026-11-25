import type { Sdk, SdkStatus } from '@linagora/twake-sdk';
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/features/auth';

import {
  refreshURLOf,
  renewTwakeSession,
  useTwakeSession,
} from '../api/useTwakeSession';
import { ensureSdkSignedIn, getPlatformSdk, platformURLOf } from '../platform';

export interface Platform {
  /** The SDK client of the user's Workplace, null off the platform */
  sdk: Sdk | null;
  /** `off` without a Workplace in the session, `failed` when its token exchange failed */
  status: SdkStatus | 'off' | 'failed';
  platformURL: string | null;
}

const PlatformContext = createContext<Platform>({
  sdk: null,
  status: 'off',
  platformURL: null,
});

/**
 * Signs Docs in to the Workplace of the user: the id token of the SSO, kept
 * by the backend, is exchanged once per page for a token of the docs app.
 * Off the platform (no workplace in the session), Docs works as before.
 */
export const PlatformProvider = ({ children }: PropsWithChildren) => {
  const { authenticated } = useAuth();
  const { data: session, error } = useTwakeSession(authenticated);
  const refreshURL = refreshURLOf(error);

  useEffect(() => {
    // A frame (the share page in Drive) cannot go through the SSO: it says
    // to open Docs, which renews the session in its own tab
    if (refreshURL && window.self === window.top) {
      renewTwakeSession(refreshURL);
    }
  }, [refreshURL]);

  const platformURL = session?.workplace_fqdn
    ? platformURLOf(session.workplace_fqdn)
    : null;
  const sdk = useMemo(
    () => (platformURL ? getPlatformSdk(platformURL) : null),
    [platformURL],
  );
  const [status, setStatus] = useState<Platform['status']>('off');

  useEffect(() => {
    if (!sdk) {
      setStatus('off');
      return;
    }
    setStatus(sdk.status);
    return sdk.onStatusChange(setStatus);
  }, [sdk]);

  useEffect(() => {
    if (!sdk || !platformURL || !session?.id_token) {
      return;
    }
    ensureSdkSignedIn(platformURL, session.id_token).catch((error) => {
      console.warn('Twake: token exchange failed, the bar stays public', error);
      setStatus('failed');
    });
  }, [sdk, platformURL, session?.id_token]);

  const value = useMemo<Platform>(
    () => ({ sdk, status, platformURL }),
    [sdk, status, platformURL],
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = () => useContext(PlatformContext);
