import { useQuery } from '@tanstack/react-query';

import { getPlatformSdk } from '../platform';

import { ApiSuggestion, Suggestion, toSuggestions } from './suggestions';

export * from './suggestions';

export const KEY_SUGGESTIONS = 'twake-suggestions';

export function useSuggestions(
  platformURL: string | null,
  query: string,
  enabled: boolean,
) {
  return useQuery<Suggestion[]>({
    queryKey: [KEY_SUGGESTIONS, platformURL, query],
    queryFn: async () => {
      if (!platformURL) {
        return [];
      }
      const response = await getPlatformSdk(platformURL).fetchJSON<{
        data: ApiSuggestion[];
      }>(`/contacts/suggest?q=${encodeURIComponent(query)}&limit=10`);
      return toSuggestions(response.data);
    },
    enabled: enabled && !!platformURL,
    staleTime: 1000 * 30,
    retry: false,
  });
}
