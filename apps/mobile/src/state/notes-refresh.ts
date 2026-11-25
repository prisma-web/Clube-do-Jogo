import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Reads the notes list again after a note write was accepted by the server, so the list cannot
 * stay on a read that started before the write.
 *
 * `invalidateQueries` alone does not guarantee that. React Query v5 only cancels an in-flight
 * fetch when the query already has data (query-core `Query.fetch`, the `cancelRefetch` branch);
 * a first read still in flight (opening the screen, reopening the app) is reused instead, and its
 * result, taken before the write landed, is then stored as fresh. Cancelling first reverts that
 * read, so the invalidation starts a new one.
 */
export async function refetchNotesAfterWrite(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  await queryClient.invalidateQueries({ queryKey, exact: true });
}
