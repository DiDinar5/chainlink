import { PrivacyBanner } from "./PrivacyBanner";
import { AccessLevelCard } from "./AccessLevelCard";
import { ActivityLog } from "./ActivityLog";
import { Wallet, TrendingUp, Shield } from "lucide-react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useVerification } from "../../lib/verificationContext";

const activityEntries = [
  {
    id: "1",
    message: "Chainlink CRE attestation verified → Level 1 Identity Pass",
    timestamp: "2026-02-19 14:32:08",
    type: "attestation" as const,
  },
  {
    id: "2",
    message: "SumSub KYC check completed → Basic Identity confirmed",
    timestamp: "2026-02-19 14:30:22",
    type: "verification" as const,
  },
  {
    id: "3",
    message: "Access Pass minted → Token ID #4829 on Base Mainnet",
    timestamp: "2026-02-19 14:28:15",
    type: "access" as const,
  },
  {
    id: "4",
    message: "RWA access granted → Parq Ubud Villa (Real Estate)",
    timestamp: "2026-02-18 09:12:44",
    type: "asset" as const,
  },
  {
    id: "5",
    message: "Chainlink CRE oracle sync → Credential refresh complete",
    timestamp: "2026-02-17 22:05:31",
    type: "attestation" as const,
  },
];

export function InvestorDashboard() {
  const { address, isConnected } = useAppKitAccount();
  const { accessLevel } = useVerification();

  const verificationLabel = accessLevel === "full" ? "Level 2" : accessLevel === "kyc" || accessLevel === "worldid" ? "Level 1" : "None";

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#111827]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Title */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Inter'] text-[1.75rem] tracking-tight text-[#111827] dark:text-[#F9FAFB]" style={{ fontWeight: 700 }}>
              Investor Portal
            </h1>
            <p className="mt-1 font-['Inter'] text-[0.9375rem] text-[#6B7280] dark:text-[#9CA3AF]" style={{ fontWeight: 400 }}>
              Manage your Access Pass and RWA verification levels
            </p>
          </div>
          {isConnected && address && (
            <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 dark:border-[#374151] dark:bg-[#1F2937]">
              <Wallet className="h-4 w-4 text-[#6B7280] dark:text-[#9CA3AF]" />
              <span className="font-['JetBrains_Mono'] text-[0.8125rem] text-[#374151] dark:text-[#E5E7EB]" style={{ fontWeight: 500 }}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 dark:border-[#374151] dark:bg-[#1F2937]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#10B981]/10">
                <Shield className="h-5 w-5 text-[#10B981]" />
              </div>
              <div>
                <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Verification Level</p>
                <p className="font-['Inter'] text-[1.25rem] text-[#111827] dark:text-[#F9FAFB]" style={{ fontWeight: 700 }}>{verificationLabel}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 dark:border-[#374151] dark:bg-[#1F2937]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3B82F6]/10">
                <TrendingUp className="h-5 w-5 text-[#3B82F6]" />
              </div>
              <div>
                <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Assets Accessible</p>
                {/* TODO: integrate CRE / read from assetRegistry */}
                <p className="font-['Inter'] text-[1.25rem] text-[#111827] dark:text-[#F9FAFB]" style={{ fontWeight: 700 }}>18 of 52</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 dark:border-[#374151] dark:bg-[#1F2937]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F59E0B]/10">
                <Wallet className="h-5 w-5 text-[#F59E0B]" />
              </div>
              <div>
                <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Access Pass</p>
                {/* TODO: read from accessPass contract */}
                <p className="font-['Inter'] text-[1.25rem] text-[#111827] dark:text-[#F9FAFB]" style={{ fontWeight: 700 }}>#4829</p>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Banner */}
        <div className="mb-8">
          <PrivacyBanner />
        </div>

        {/* Access Pass Levels */}
        <div className="mb-8">
          <h2 className="mb-5 font-['Inter'] text-[1.125rem] text-[#111827]" style={{ fontWeight: 600 }}>
            Access Pass Levels
          </h2>
          <div className="space-y-4">
            <AccessLevelCard
              level={1}
              title="Basic Identity Verification"
              providers={["SumSub", "Persona"]}
              features={[
                "Access for majority of assets",
                "Full control of PII",
                "On-chain privacy preserved",
              ]}
              accessRate={65}
              isActive={true}
              assetIcons={[]}
            />
            <AccessLevelCard
              level={2}
              title="Address Verification"
              providers={["SumSub", "Persona"]}
              features={[
                "Access for more assets",
                "Enhanced verification score",
                "Priority asset allocation",
              ]}
              accessRate={73}
              isActive={false}
            />
            <AccessLevelCard
              level={3}
              title="Proof of Human"
              providers={["World ID"]}
              features={[
                "Maximum asset access",
                "Institutional-grade clearance",
                "Cross-chain portability",
              ]}
              accessRate={90}
              isActive={false}
            />
          </div>
        </div>

        {/* Activity Log */}
        <ActivityLog entries={activityEntries} />
      </div>
    </div>
  );
}
