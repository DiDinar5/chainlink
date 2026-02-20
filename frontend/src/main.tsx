import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App.tsx";
import { VerificationProvider } from "./lib/verificationContext";
import { wagmiConfig, queryClient, isAppKitEnabled } from "./config/wagmi";
import "./styles/index.css";

console.log("[main] isAppKitEnabled:", isAppKitEnabled);

createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <VerificationProvider>
        {!isAppKitEnabled && (
          <div className="bg-amber-500/90 px-4 py-2 text-center text-sm text-black">
            WalletConnect not configured — UI preview mode. Add VITE_WALLET_CONNECT_PROJECT_ID to .env
          </div>
        )}
        <App />
      </VerificationProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
