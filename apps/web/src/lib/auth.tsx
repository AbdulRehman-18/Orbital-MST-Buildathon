import {
  createSiweNonce,
  getDemoConfig,
  logout as apiLogout,
  refreshSession,
  sendOtp,
  verifyOtp,
  verifySiwe,
  type AuthTokens,
  type SessionUser,
} from "@namma-seva/api-client";
import { connect, disconnect, getConnection, signMessage, switchChain } from "wagmi/actions";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSiweMessage } from "viem/siwe";
import { queryClient, setAccessToken } from "./api";
import { CONSENT_VERSION } from "./consent";
import i18n from "./i18n";
import { burner } from "./burner";
import { chain } from "./chain";
import { wagmiConfig } from "./wagmi";

export type Role = SessionUser["role"];

type AuthState = {
  status: "loading" | "anonymous" | "signed-in";
  user: SessionUser | null;
  /** Key of the demo account in use (burner wallet), if any. */
  demoKey: string | null;
  signInWithWallet: () => Promise<SessionUser>;
  signInAsDemo: (key: string) => Promise<SessionUser>;
  sendCode: (phone: string) => Promise<{ devCode?: string; expiresIn: number }>;
  /** `demoName` labels demo citizens; real citizens stay anonymous (hash only). */
  signInWithPhone: (phone: string, code: string, demoName?: string) => Promise<SessionUser>;
  displayName: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY_STORAGE = "ns_demo_account";
const DEMO_NAME_STORAGE = "ns_demo_name";
const REFRESH_EVERY_MS = 12 * 60 * 1000; // access tokens live 15 min

// Refresh tokens rotate on every use, so concurrent refreshes (StrictMode double effects, a timer
// firing during a restore) would revoke each other. Share one in-flight request.
let inFlight: Promise<AuthTokens> | null = null;
const refreshOnce = () =>
  (inFlight ??= refreshSession().finally(() => {
    inFlight = null;
  }));

const readDemoKey = () => {
  try {
    return localStorage.getItem(DEMO_KEY_STORAGE);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demoKey, setDemoKey] = useState<string | null>(readDemoKey);
  const [displayName, setDisplayName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DEMO_NAME_STORAGE);
    } catch {
      return null;
    }
  });
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const apply = useCallback((tokens: AuthTokens) => {
    setAccessToken(tokens.accessToken);
    setUser(tokens.user);
    setStatus("signed-in");
    void queryClient.invalidateQueries();
    return tokens.user;
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    void queryClient.invalidateQueries();
  }, []);

  // Restore the session from the refresh cookie, and keep the access token fresh.
  useEffect(() => {
    let cancelled = false;
    refreshOnce()
      .then((t) => !cancelled && apply(t))
      .catch(() => !cancelled && clear());
    timer.current = setInterval(() => {
      refreshOnce().then(apply).catch(clear);
    }, REFRESH_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer.current);
    };
  }, [apply, clear]);

  // A restored demo session needs its burner wallet back to sign transactions.
  useEffect(() => {
    if (status !== "signed-in" || !demoKey || !user?.walletAddress) return;
    if (getConnection(wagmiConfig).address) return;
    void connectDemo(demoKey).catch(() => undefined);
  }, [status, demoKey, user?.walletAddress]);

  const siwe = useCallback(async () => {
    const connection = getConnection(wagmiConfig);
    if (!connection.address) throw new Error("Connect a wallet first");
    if (connection.chainId !== chain.id) await switchChain(wagmiConfig, { chainId: chain.id });
    const { nonce, domain, chainId } = await createSiweNonce();
    const message = createSiweMessage({
      domain,
      address: connection.address,
      statement: "Sign in to Namma Seva. This does not send a transaction or cost gas.",
      uri: window.location.origin,
      version: "1",
      chainId,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await signMessage(wagmiConfig, { message });
    return apply(await verifySiwe({ message, signature }));
  }, [apply]);

  const signInWithWallet = useCallback(async () => {
    if (!getConnection(wagmiConfig).address) {
      const injectedConnector = wagmiConfig.connectors.find((c) => c.type === "injected");
      if (!injectedConnector) throw new Error("No browser wallet found — install MetaMask or BridgeKey");
      await connect(wagmiConfig, { connector: injectedConnector, chainId: chain.id });
    }
    setDemoKey(null);
    localStorage.removeItem(DEMO_KEY_STORAGE);
    return siwe();
  }, [siwe]);

  const signInAsDemo = useCallback(
    async (key: string) => {
      await disconnect(wagmiConfig).catch(() => undefined);
      await connectDemo(key);
      localStorage.setItem(DEMO_KEY_STORAGE, key);
      localStorage.removeItem(DEMO_NAME_STORAGE);
      setDisplayName(null);
      setDemoKey(key);
      return siwe();
    },
    [siwe],
  );

  const sendCode = useCallback(async (phone: string) => {
    // The consent notice is shown (and accepted) in the login screen before this is ever called.
    const r = await sendOtp({ phone, consentVersion: CONSENT_VERSION });
    return { devCode: r.devCode, expiresIn: r.expiresIn };
  }, []);

  const signInWithPhone = useCallback(
    async (phone: string, code: string, demoName?: string) => {
      await disconnect(wagmiConfig).catch(() => undefined);
      const lang = ["en", "kn", "ta", "hi"].find((l) => l === i18n.language) as "en" | "kn" | "ta" | "hi" | undefined;
      const tokens = await verifyOtp({ phone, code, consentVersion: CONSENT_VERSION, lang });
      localStorage.removeItem(DEMO_KEY_STORAGE);
      setDemoKey(null);
      if (demoName) localStorage.setItem(DEMO_NAME_STORAGE, demoName);
      else localStorage.removeItem(DEMO_NAME_STORAGE);
      setDisplayName(demoName ?? null);
      return apply(tokens);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    await disconnect(wagmiConfig).catch(() => undefined);
    localStorage.removeItem(DEMO_KEY_STORAGE);
    localStorage.removeItem(DEMO_NAME_STORAGE);
    setDemoKey(null);
    setDisplayName(null);
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ status, user, demoKey, displayName, signInWithWallet, signInAsDemo, sendCode, signInWithPhone, signOut }),
    [status, user, demoKey, displayName, signInWithWallet, signInAsDemo, sendCode, signInWithPhone, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function connectDemo(key: string) {
  const demo = await getDemoConfig();
  const account = demo.accounts.find((a) => a.key === key);
  if (!demo.enabled || !demo.mnemonic || !account) throw new Error("Demo mode is not enabled on this server");
  await connect(wagmiConfig, {
    connector: burner({ mnemonic: demo.mnemonic, index: account.index, name: account.name }),
    chainId: chain.id,
  });
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Dashboard route for a role. */
export const ROLE_HOME: Partial<Record<Role, string>> = {
  CITIZEN: "/citizen",
  GOVT_OFFICIAL: "/official",
  AUDITOR: "/auditor",
  CONTRACTOR: "/contractor",
  ADMIN: "/admin",
};
