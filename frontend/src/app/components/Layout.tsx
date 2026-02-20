import { Outlet } from "react-router";
import { Header } from "./Header";
import { useVerification } from "../../lib/verificationContext";

export function Layout() {
  const { kycVerified, worldIdVerified } = useVerification();

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-['Inter'] dark:bg-[#111827]">
      <Header />
      {/* Verification status (stub: TODO integrate CRE / passRegistry) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] bg-white/60 px-6 py-2 dark:border-[#374151] dark:bg-[#1F2937]/80">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium ${
            kycVerified
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          }`}
        >
          KYC {kycVerified ? "Verified" : "Pending"}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium ${
            worldIdVerified
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          }`}
        >
          World ID {worldIdVerified ? "Verified" : "Pending"}
        </span>
      </div>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
