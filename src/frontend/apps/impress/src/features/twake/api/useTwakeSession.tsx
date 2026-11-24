import { useQuery } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';

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

export const getTwakeSession = async (): Promise<TwakeSession> => {
  const response = await fetchAPI(`twake/session/`);
  if (!response.ok) {
    throw new APIError(
      `Couldn't fetch the Twake session: ${response.statusText}`,
      await errorCauses(response),
    );
  }
  return response.json() as Promise<TwakeSession>;
};

export const KEY_TWAKE_SESSION = 'twake-session';

export function useTwakeSession(enabled: boolean) {
  return useQuery<TwakeSession, APIError>({
    queryKey: [KEY_TWAKE_SESSION],
    queryFn: getTwakeSession,
    enabled,
    staleTime: 1000 * 60 * 15,
    retry: false,
  });
}
