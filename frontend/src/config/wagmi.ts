/**
 * Wagmi + Reown AppKit config for wallet connect.
 * No throw on missing projectId — console.error + fallback config so app always renders.
 */
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { mainnet, sepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit-common";
import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { mainnet as mainnetChain, sepolia as sepoliaChain } from "wagmi/chains";

// -----------------------------------------------------------------------------
// Query client
// -----------------------------------------------------------------------------
export const queryClient = new QueryClient();

// -----------------------------------------------------------------------------
// Project ID — no throw: use dummy so createAppKit always runs (hooks need it)
// -----------------------------------------------------------------------------
const DUMMY_PROJECT_ID = "b56e18d47c72ab683b10814fe9495694";
const envProjectId =
  (import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID as string)?.trim() ||
  (import.meta.env.VITE_WC_PROJECT_ID as string)?.trim();
const projectId = envProjectId || DUMMY_PROJECT_ID;

if (!envProjectId) {
  console.error(
    "No WalletConnect Project ID in .env → connect disabled. Set VITE_WALLET_CONNECT_PROJECT_ID or VITE_WC_PROJECT_ID."
  );
}

// -----------------------------------------------------------------------------
// Standard networks (mainnet + sepolia) — no custom defineChain for stability
// -----------------------------------------------------------------------------
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, sepolia];

// -----------------------------------------------------------------------------
// Metadata — localhost in dev to avoid verification errors
// -----------------------------------------------------------------------------
const metadata = {
  name: "VeriRWA",
  description: "RWA Aggregator with Chainlink CRE Verification",
  url: import.meta.env.DEV ? "http://localhost:5173" : (typeof globalThis !== "undefined" && (globalThis as { location?: { origin?: string } }).location?.origin) ?? "https://verirwa.com",
  icons: [] as string[],
};

// -----------------------------------------------------------------------------
// AppKit init with try/catch — always run so useAppKit() hooks don't throw
// -----------------------------------------------------------------------------
export const isAppKitEnabled = Boolean(envProjectId);
let wagmiConfigExport: ReturnType<WagmiAdapter["wagmiConfig"]>;

try {
  console.log("[wagmi] Using projectId:", projectId.slice(0, 8) + "...");
  const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
    ssr: true, // critical for Vite/React to avoid white screen
  });
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    themeMode: "dark",
    features: { email: false, socials: false },
  });
  wagmiConfigExport = wagmiAdapter.wagmiConfig;
  console.log("[wagmi] AppKit initialized");
} catch (e) {
  console.error("[wagmi] AppKit init failed:", e);
  wagmiConfigExport = createConfig({
    chains: [mainnetChain, sepoliaChain],
    transports: {
      [mainnetChain.id]: http(),
      [sepoliaChain.id]: http(),
    },
  }) as ReturnType<WagmiAdapter["wagmiConfig"]>;
}

export const wagmiConfig = wagmiConfigExport;
