import { Link, useLocation } from "react-router";
import { Shield, Layers } from "lucide-react";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { isAppKitEnabled } from "../../config/wagmi";

export function Header() {
  const location = useLocation();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chain } = useAppKitNetwork();

  const navItems = [
    { label: "Investor Portal", path: "/" },
    { label: "Assets", path: "/assets" },
    { label: "Issuer Portal", path: "/issuer" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E5E7EB] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2D3748]">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <span className="font-['Inter'] text-[1.25rem] tracking-tight text-[#2D3748]" style={{ fontWeight: 700 }}>
            TrustLayer
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-lg px-4 py-2 font-['Inter'] text-[0.875rem] transition-all ${
                  isActive
                    ? "bg-[#2D3748] text-white"
                    : "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#2D3748]"
                }`}
                style={{ fontWeight: isActive ? 600 : 500 }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Wallet connect / account — disabled when AppKit not configured */}
        {isConnected && address ? (
          <button
            type="button"
            onClick={() => isAppKitEnabled && open()}
            disabled={!isAppKitEnabled}
            title={!isAppKitEnabled ? "Add Project ID to .env" : undefined}
            className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 transition-colors hover:bg-[#F9FAFB] dark:border-[#374151] dark:bg-[#1F2937] dark:hover:bg-[#374151] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <span className="font-['JetBrains_Mono'] text-[0.8125rem] text-[#374151] dark:text-[#E5E7EB]" style={{ fontWeight: 500 }}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            {chain?.name && (
              <span className="text-[0.75rem] text-[#6B7280] dark:text-[#9CA3AF]">{chain.name}</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => isAppKitEnabled && open()}
            disabled={!isAppKitEnabled}
            title={!isAppKitEnabled ? "Add Project ID to .env" : undefined}
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-3 font-['Inter'] text-[0.875rem] font-semibold text-white shadow-sm transition-all hover:bg-cyan-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:focus:ring-offset-[#111827] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
          >
            <Shield className="h-4 w-4" />
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
