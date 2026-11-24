import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import { Doc, Role } from '@/docs/doc-management';

/**
 * A document shared with a group of the organization, or placed in a shared
 * drive of Drive. Docs shows one line; the side service turns it into one
 * access per member.
 */
export interface Grant {
  id: string;
  document: string;
  source_kind: 'group' | 'shared_drive';
  source_id: string;
  name: string;
  member_count: number | null;
  role: Role;
}

export const KEY_LIST_GRANTS = 'twake-grants';

const grantsUrl = (docId: string) => `twake/documents/${docId}/grants/`;

export const getGrants = async (docId: string): Promise<Grant[]> => {
  const response = await fetchAPI(grantsUrl(docId));
  if (!response.ok) {
    throw new APIError('Failed to get the grants', await errorCauses(response));
  }
  return response.json() as Promise<Grant[]>;
};

export function useGrants(docId: Doc['id'], enabled = true) {
  return useQuery<Grant[], APIError>({
    queryKey: [KEY_LIST_GRANTS, docId],
    queryFn: () => getGrants(docId),
    enabled,
  });
}

interface CreateGrantParams {
  docId: Doc['id'];
  sourceId: string;
  name: string;
  role: Role;
}

export const createGrant = async ({
  docId,
  sourceId,
  name,
  role,
}: CreateGrantParams): Promise<Grant> => {
  const response = await fetchAPI(grantsUrl(docId), {
    method: 'POST',
    body: JSON.stringify({
      source_kind: 'group',
      source_id: sourceId,
      name,
      role,
    }),
  });
  if (!response.ok) {
    throw new APIError(
      'Failed to share with the group',
      await errorCauses(response),
    );
  }
  return response.json() as Promise<Grant>;
};

export function useCreateGrant() {
  const queryClient = useQueryClient();
  return useMutation<Grant, APIError, CreateGrantParams>({
    mutationFn: createGrant,
    onSuccess: (_data, { docId }) => {
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_GRANTS, docId],
      });
    },
  });
}

export function useUpdateGrant() {
  const queryClient = useQueryClient();
  return useMutation<
    Grant,
    APIError,
    { docId: Doc['id']; grantId: string; role: Role }
  >({
    mutationFn: async ({ docId, grantId, role }) => {
      const response = await fetchAPI(`${grantsUrl(docId)}${grantId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        throw new APIError(
          'Failed to change the role of the group',
          await errorCauses(response),
        );
      }
      return response.json() as Promise<Grant>;
    },
    onSuccess: (_data, { docId }) => {
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_GRANTS, docId],
      });
    },
  });
}

export function useDeleteGrant() {
  const queryClient = useQueryClient();
  return useMutation<void, APIError, { docId: Doc['id']; grantId: string }>({
    mutationFn: async ({ docId, grantId }) => {
      const response = await fetchAPI(`${grantsUrl(docId)}${grantId}/`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new APIError(
          'Failed to remove the group',
          await errorCauses(response),
        );
      }
    },
    onSuccess: (_data, { docId }) => {
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_GRANTS, docId],
      });
    },
  });
}

interface ShareByEmailParams {
  docId: Doc['id'];
  email: string;
  role: Role;
}

/** An access for a known person, an invitation for an unknown one. */
export const shareByEmail = async ({
  docId,
  email,
  role,
}: ShareByEmailParams): Promise<{
  kind: 'access' | 'invitation';
  id: string;
}> => {
  const response = await fetchAPI(`twake/documents/${docId}/accesses/`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
  if (!response.ok) {
    throw new APIError(
      `Failed to share with ${email}`,
      await errorCauses(response, { type: 'invitation', value: email }),
    );
  }
  return response.json() as Promise<{
    kind: 'access' | 'invitation';
    id: string;
  }>;
};
