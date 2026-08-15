import { QueryCache, QueryClient } from "@tanstack/react-query";

// Shared QueryClient. Feishu data is small (~750 records total) so we treat it
// as "load once": queries never go stale on their own (`staleTime: Infinity`),
// so the only triggers for a refetch are an explicit `refetch()` (manual refresh)
// or `invalidateQueries` after a mutation.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Session expired mid-use: any query that 401s bounces to the login page.
      if ((error as { status?: number }).status === 401) {
        window.location.href = "/login";
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
