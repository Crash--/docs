import { useMutation, useQueryClient } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import { KEY_LIST_DOC } from '@/docs/doc-management';
import { KEY_LIST_SEARCH_DOC } from '@/docs/doc-search/api/useSearchDocs';

export interface Placement {
  instance: string;
  dir_id: string;
}

interface CreatePlacedDocParams {
  placement: Placement;
  title?: string;
}

/**
 * A document created from Drive: Docs records where its pointer goes and the
 * side service writes the pointer there from the `document.created` event.
 */
export const createPlacedDoc = async ({
  placement,
  title,
}: CreatePlacedDocParams): Promise<{ id: string }> => {
  const response = await fetchAPI('twake/documents/', {
    method: 'POST',
    body: JSON.stringify({ title, placement }),
  });
  if (!response.ok) {
    throw new APIError(
      'Failed to create the document',
      await errorCauses(response),
    );
  }
  return response.json() as Promise<{ id: string }>;
};

export function useCreatePlacedDoc() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, APIError, CreatePlacedDocParams>({
    mutationFn: createPlacedDoc,
    onSuccess: () => {
      void queryClient.resetQueries({ queryKey: [KEY_LIST_DOC] });
      void queryClient.resetQueries({ queryKey: [KEY_LIST_SEARCH_DOC] });
    },
  });
}
