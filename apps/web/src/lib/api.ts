import { ApiError, getChainStatus, getDemoConfig, setAuthTokenGetter } from "@namma-seva/api-client";
import { QueryClient, useQuery, type QueryKey } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// The access token lives in memory only; the refresh token is the httpOnly `ns_session` cookie.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;
setAuthTokenGetter(() => accessToken);

/** `useQuery` over a generated fetcher, keyed like the generated hooks. */
export function useApi<T>(key: QueryKey, fn: () => Promise<T>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({ queryKey: key, queryFn: fn, ...opts });
}

export const useChainStatus = () =>
  useApi(["/api/chain/status"], () => getChainStatus(), { refetchInterval: 15_000 });

export const useDemo = () => useQuery({ queryKey: ["/api/demo"], queryFn: () => getDemoConfig(), staleTime: Infinity });

/** Escrow accounting unit of the deployment (LEDGER = INR paise, ESCROW = wei). */
export const useMode = () => useChainStatus().data?.mode ?? "LEDGER";

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const d = err.data as { message?: string } | null;
    return d?.message ?? err.message;
  }
  const e = err as { shortMessage?: string; message?: string };
  return e?.shortMessage ?? e?.message ?? String(err);
}

/** Multipart upload with the bearer token (the generated client is JSON-only). */
export async function uploadForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body: form,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `Upload failed (${res.status})`);
  return body as T;
}
