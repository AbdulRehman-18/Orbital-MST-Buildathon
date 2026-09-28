/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NS_CHAIN?: string;
  readonly VITE_NS_API_URL?: string;
  readonly VITE_NS_EXPLORER_URL?: string;
  readonly VITE_NS_IPFS_GATEWAY?: string;
  readonly VITE_NS_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
