import { mainnetTransport } from '../../shared/mainnet-rpc.mjs';
import { http } from "wagmi";
import type { Chain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ALL_CHAINS, PRODUCTION_CHAINS } from "@/lib/constants/chains.ts";

// The wallet/network switcher only offers mainnet + Base. Sepolia / Base Sepolia
// show up only when VITE_ENABLE_TESTNETS=true (local dev), never in production.
const SHOW_TESTNETS = (import.meta.env.VITE_ENABLE_TESTNETS as string | undefined) === "true";
const WALLET_CHAINS: readonly [Chain, ...Chain[]] = SHOW_TESTNETS ? ALL_CHAINS : PRODUCTION_CHAINS;

/**
 * Shared wallet/RPC config for Bittrees Research. Exported as a module singleton
 * so the messenger (and @wagmi/core calls inside it) use the same config the
 * providers are built from.
 */

const FALLBACK_PROJECT_ID = "8971e0de563ab27ccfff96c91ac1c3c3";

const rawProjectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim();
const projectId = rawProjectId || FALLBACK_PROJECT_ID;

// Dedicated mainnet RPC with bounded public failover for provider outages.
const mainnetRpc = import.meta.env.VITE_MAINNET_RPC_URL as string | undefined;
const httpConfig = { batch: true } as const;

// WalletConnect metadata.url must match the page ORIGIN, not the current route,
// or it trips the "configured metadata.url differs" warning and weakens domain
// verification. Use the live origin (correct on prod, previews, and local dev).
const appOrigin =
  typeof window !== "undefined" ? window.location.origin : "https://research.bittrees.org";

export const wagmiConfig = getDefaultConfig({
  appName: "Bittrees Research",
  appDescription: "Bittrees Research — a members-only research foundation.",
  appUrl: appOrigin,
  appIcon: `${appOrigin}/bittrees_logo_tree.png`,
  projectId,
  chains: WALLET_CHAINS,
  transports: Object.fromEntries(
    WALLET_CHAINS.map((c) => [
      c.id,
      c.id === 1 ? mainnetTransport(mainnetRpc) : http(undefined, httpConfig),
    ])
  ),
  ssr: false,
});
