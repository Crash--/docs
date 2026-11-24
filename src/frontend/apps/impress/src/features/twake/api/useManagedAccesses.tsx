import { useQuery } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import { Doc } from '@/docs/doc-management';

export const KEY_MANAGED_ACCESSES = 'twake-managed-accesses';

/**
 * The accesses the grants of a document posed, without a direct role: the
 * dialog shows the group or the drive they come from, not one line per member.
 */
export function useManagedAccessIds(docId: Doc['id'], enabled = true) {
  return useQuery<string[], APIError>({
    queryKey: [KEY_MANAGED_ACCESSES, docId],
    queryFn: async () => {
      const response = await fetchAPI(
        `twake/documents/${docId}/accesses/managed/`,
      );
      if (!response.ok) {
        throw new APIError(
          'Failed to get the managed accesses',
          await errorCauses(response),
        );
      }
      const body = (await response.json()) as { access_ids: string[] };
      return body.access_ids;
    },
    enabled,
  });
}
