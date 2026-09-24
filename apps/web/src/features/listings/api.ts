import type {
  DictionariesDto,
  ListingBoardDto,
  ListingDetailsDto,
  ListingDraft,
  ListingPatch,
  ListingStageChange,
  NewComment,
  UserBriefDto,
} from '@crm/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, upload } from '../../api/client';

export const listingKeys = {
  board: ['listings', 'board'] as const,
  one: (id: number) => ['listings', id] as const,
};

export function useListingBoard() {
  return useQuery({
    queryKey: listingKeys.board,
    queryFn: () => api<ListingBoardDto>('/listings'),
  });
}

export function useListing(id: number | null) {
  return useQuery({
    queryKey: listingKeys.one(id ?? 0),
    queryFn: () => api<ListingDetailsDto>(`/listings/${id}`),
    enabled: id !== null,
  });
}

/** Общая обработка ответа: обновить карточку и доску; при конфликте версий — перечитать. */
function useListingMutation<TVars>(fn: (vars: TVars) => Promise<ListingDetailsDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (listing) => {
      qc.setQueryData(listingKeys.one(listing.id), listing);
      void qc.invalidateQueries({ queryKey: listingKeys.board });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        ['VERSION_CONFLICT', 'ALREADY_CLAIMED'].includes(error.code ?? '')
      ) {
        notifications.show({ color: 'orange', message: error.message });
        void qc.invalidateQueries({ queryKey: ['listings'] });
      }
    },
  });
}

export const useCreateListing = () =>
  useListingMutation((draft: ListingDraft) =>
    api<ListingDetailsDto>('/listings', { method: 'POST', body: draft }),
  );

export const useUpdateListing = () =>
  useListingMutation(({ id, patch }: { id: number; patch: ListingPatch }) =>
    api<ListingDetailsDto>(`/listings/${id}`, { method: 'PATCH', body: patch }),
  );

export const useChangeStage = () =>
  useListingMutation(({ id, change }: { id: number; change: ListingStageChange }) =>
    api<ListingDetailsDto>(`/listings/${id}/stage`, { method: 'POST', body: change }),
  );

export const useAddComment = () =>
  useListingMutation(({ id, comment }: { id: number; comment: NewComment }) =>
    api<ListingDetailsDto>(`/listings/${id}/comments`, { method: 'POST', body: comment }),
  );

export const useUploadPhotos = () =>
  useListingMutation(({ id, files }: { id: number; files: File[] }) => {
    const form = new FormData();
    for (const file of files) form.append('photos', file);
    return upload<ListingDetailsDto>(`/listings/${id}/photos`, form);
  });

export const useRemovePhoto = () =>
  useListingMutation(({ id, photoId }: { id: number; photoId: number }) =>
    api<ListingDetailsDto>(`/listings/${id}/photos/${photoId}`, { method: 'DELETE' }),
  );

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listingKeys.board }),
  });
}

export function useDictionaries() {
  return useQuery({
    queryKey: ['dictionaries'],
    queryFn: () => api<DictionariesDto>('/dictionaries'),
    staleTime: 10 * 60_000,
  });
}

/** Сотрудники и партнёры для выбора ответственного. Партнёрам не нужен и не выдаётся. */
export function useUserDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api<UserBriefDto[]>('/users/directory'),
    enabled,
    staleTime: 5 * 60_000,
  });
}
