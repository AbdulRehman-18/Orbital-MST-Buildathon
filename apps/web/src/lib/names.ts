import { getListProfilesQueryKey, listProfiles } from "@namma-seva/api-client";
import { useQuery } from "@tanstack/react-query";
import { useDemo } from "./api";

export type AccountName = { name: string; title?: string | null };

/**
 * Public name for a wallet (a contractor firm, an office), so the UI never shows a bare address
 * where a name is known. Source: the admin-maintained registry (`/api/profiles`), then the demo
 * cast in demo mode. Unknown → undefined (callers fall back to a role label + short address).
 */
export function useNameOf() {
  const demo = useDemo();
  const profiles = useQuery({ queryKey: getListProfilesQueryKey(), queryFn: () => listProfiles(), staleTime: 60_000 });
  const byAddress = new Map<string, AccountName>();
  for (const a of demo.data?.accounts ?? []) byAddress.set(a.address.toLowerCase(), { name: a.name, title: a.title });
  for (const p of profiles.data ?? []) byAddress.set(p.address.toLowerCase(), { name: p.name, title: p.title });
  return (address: string | null | undefined): AccountName | undefined =>
    address ? byAddress.get(address.toLowerCase()) : undefined;
}
