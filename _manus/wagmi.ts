import { createConfig, http } from "wagmi";
import { mainnet, arbitrum, base, optimism } from "wagmi/chains";
import { walletConnect, metaMask, coinbaseWallet, injected } from "wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;

if (!projectId) {
  console.warn("[Wagmi] VITE_WALLETCONNECT_PROJECT_ID is not set — WalletConnect will not work.");
}

// Use the actual page origin so WalletConnect metadata matches in both dev and production.
// Falls back to the production domain if window is not available (SSR guard).
const siteUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://anavitrade-jr7m46kw.manus.space";

const siteIcon = `${siteUrl}/manus-storage/anavi-logo-icon_9cb70b20.png`;

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism],
  connectors: [
    // MetaMask (injected EIP-1193)
    metaMask({
      dappMetadata: {
        name: "@navi",
        url: siteUrl,
        iconUrl: siteIcon,
      },
    }),
    // WalletConnect v2 — covers Ledger Live mobile, Rainbow, Trust, etc.
    walletConnect({
      projectId,
      metadata: {
        name: "@navi — Quantitative Trading",
        description: "Autonomous Quantitative Trading — Non-Custodial",
        url: siteUrl,
        icons: [siteIcon],
      },
      showQrModal: true,
    }),
    // Coinbase Wallet
    coinbaseWallet({
      appName: "@navi",
      appLogoUrl: siteIcon,
    }),
    // Generic injected (catches Rabby, Frame, Brave Wallet, etc.)
    injected({ target: "metaMask" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
  },
});

export type WagmiConfig = typeof wagmiConfig;
