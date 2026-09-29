import { useDemo } from "./api";

/**
 * Public name for a wallet (a firm, an office). ponytail: only the demo roster is known today;
 * production needs an admin-maintained name registry served by the API. Unknown → undefined.
 */
export function useNameOf() {
  const demo = useDemo();
  return (address: string | null | undefined) =>
    address ? demo.data?.accounts.find((a) => a.address.toLowerCase() === address.toLowerCase()) : undefined;
}
