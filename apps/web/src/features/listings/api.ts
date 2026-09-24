import type {
  DictionariesDto,
  ListingBoardDto,
  ListingDetailsDto,
  ListingDraft,
} from '@crm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

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

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: ListingDraft) =>
      api<ListingDetailsDto>('/listings', { method: 'POST', body: draft }),
    onSuccess: (listing) => {
      qc.setQueryData(listingKeys.one(listing.id), listing);
      void qc.invalidateQueries({ queryKey: listingKeys.board });
    },
  });
}

export function useDictionaries() {
  return useQuery({
    queryKey: ['dictionaries'],
    queryFn: () => api<DictionariesDto>('/dictionaries'),
    staleTime: 10 * 60_000,
  });
}
