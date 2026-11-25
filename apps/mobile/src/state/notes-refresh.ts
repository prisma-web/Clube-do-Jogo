import type { QueryClient, QueryKey } from '@tanstack/react-query';

export async function refetchNotesAfterWrite(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  await queryClient.invalidateQueries({ queryKey, exact: true });
}
