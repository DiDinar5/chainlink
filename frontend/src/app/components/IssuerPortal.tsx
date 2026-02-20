import { ActivityLog } from "./ActivityLog";
import {
  Building2,
  CheckCircle,
  ExternalLink,
  Plus,
  Edit3,
  ShieldCheck,
  Link2,
  Home,
  Briefcase,
  FileText,
  Landmark,
} from "lucide-react";

const assets = [
  {
    id: "1",
    name: "Parq Ubud Villa",
    status: "Verified",
    value: "$300,000",
    type: "Real Estate",
    typeIcon: Home,
    chainlinkVerified: true,
  },
  {
    id: "2",
    name: "Jakarta Tech Hub",
    status: "Verified",
    value: "$1,200,000",
    type: "Real Estate",
    typeIcon: Building2,
    chainlinkVerified: true,
  },
  {
    id: "3",
    name: "Binaryx Equity Fund I",
    status: "Verified",
    value: "$500,000",
    type: "Private Equity",
    typeIcon: Briefcase,
    chainlinkVerified: true,
  },
  {
    id: "4",
    name: "Green Energy Bond 2026",
    status: "Pending",
    value: "$250,000",
    type: "Bond",
    typeIcon: FileText,
    chainlinkVerified: false,
  },
];

const issuerActivityEntries = [
  {
    id: "1",
    message: "[Parq Ubud Villa] Chainlink CRE attestation verified",
    timestamp: "2026-02-19 14:32:08",
    type: "attestation" as const,
  },
  {
    id: "2",
    message: "[Binaryx Equity Fund I] asset created",
    timestamp: "2026-02-19 10:15:44",
    type: "asset" as const,
  },
  {
    id: "3",
    message: "[Jakarta Tech Hub] valuation updated → $1.2M",
    timestamp: "2026-02-18 16:22:33",
    type: "asset" as const,
  },
  {
    id: "4",
    message: "[Green Energy Bond 2026] asset created — pending verification",
    timestamp: "2026-02-18 09:05:12",
    type: "asset" as const,
  },
  {
    id: "5",
    message: "[Binaryx Protocol DAO LLC] KYB verification completed via Persona",
    timestamp: "2026-02-17 11:48:29",
    type: "verification" as const,
  },
];

export function IssuerPortal() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="font-['Inter'] text-[1.75rem] tracking-tight text-[#111827]" style={{ fontWeight: 700 }}>
            Issuer Portal
          </h1>
          <p className="mt-1 font-['Inter'] text-[0.9375rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
            Manage your organization, assets, and verification status
          </p>
        </div>

        {/* Corporate Identity Card */}
        <div className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D3748] to-[#4A5568]">
                <Building2 className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="font-['Inter'] text-[1.25rem] text-[#111827]" style={{ fontWeight: 700 }}>
                  Binaryx Protocol DAO LLC
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 font-['Inter'] text-[0.75rem] text-[#10B981]"
                    style={{ fontWeight: 600 }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    Active
                  </span>
                  <span className="font-['Inter'] text-[0.8125rem] text-[#9CA3AF]" style={{ fontWeight: 400 }}>
                    Registered Entity
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-['JetBrains_Mono'] text-[0.8125rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
                EIN: ••••-••4821
              </span>
            </div>
          </div>
        </div>

        {/* Verification Badges */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-xl border border-[#10B981]/20 bg-[#F0FDF4] p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/20">
              <ShieldCheck className="h-5 w-5 text-[#10B981]" />
            </div>
            <div className="flex-1">
              <p className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 600 }}>
                KYB Verified via Persona
              </p>
              <p className="mt-0.5 font-['Inter'] text-[0.75rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
                Business identity confirmed
              </p>
            </div>
            <CheckCircle className="h-5 w-5 text-[#10B981]" />
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-[#3B82F6]/20 bg-[#EFF6FF] p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#3B82F6]/20">
              <Link2 className="h-5 w-5 text-[#3B82F6]" />
            </div>
            <div className="flex-1">
              <p className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 600 }}>
                Chainlink CRE Attestation Verified
              </p>
              <p className="mt-0.5 font-['Inter'] text-[0.75rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
                On-chain proof recorded
              </p>
            </div>
            <button className="flex items-center gap-1 font-['Inter'] text-[0.75rem] text-[#3B82F6] transition-colors hover:text-[#1D4ED8]"
              style={{ fontWeight: 500 }}
            >
              Proof
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Asset Stats + Actions */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Total Assets</p>
              <p className="font-['Inter'] text-[1.5rem] text-[#111827]" style={{ fontWeight: 700 }}>4</p>
            </div>
            <div className="h-10 w-px bg-[#E5E7EB]" />
            <div>
              <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Verified</p>
              <p className="font-['Inter'] text-[1.5rem] text-[#10B981]" style={{ fontWeight: 700 }}>3</p>
            </div>
            <div className="h-10 w-px bg-[#E5E7EB]" />
            <div>
              <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Pending</p>
              <p className="font-['Inter'] text-[1.5rem] text-[#F59E0B]" style={{ fontWeight: 700 }}>1</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 rounded-lg bg-[#2D3748] px-4 py-2.5 font-['Inter'] text-[0.8125rem] text-white shadow-sm transition-all hover:bg-[#1a202c]"
              style={{ fontWeight: 600 }}
            >
              <Plus className="h-4 w-4" />
              Verify New Asset
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-4 py-2.5 font-['Inter'] text-[0.8125rem] text-[#374151] transition-all hover:bg-[#F9FAFB]"
              style={{ fontWeight: 500 }}
            >
              <Edit3 className="h-4 w-4" />
              Update Asset Info
            </button>
          </div>
        </div>

        {/* Asset Management Table */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#E5E7EB] px-6 py-4">
            <h3 className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 600 }}>
              Asset Management
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB]">
                  <th className="px-6 py-3 text-left font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 600 }}>
                    Asset Name
                  </th>
                  <th className="px-6 py-3 text-left font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 600 }}>
                    Status
                  </th>
                  <th className="px-6 py-3 text-left font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 600 }}>
                    Value
                  </th>
                  <th className="px-6 py-3 text-left font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 600 }}>
                    Type
                  </th>
                  <th className="px-6 py-3 text-left font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 600 }}>
                    Chainlink CRE
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {assets.map((asset) => {
                  const IconComponent = asset.typeIcon;
                  return (
                    <tr key={asset.id} className="transition-colors hover:bg-[#F9FAFB]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3F4F6]">
                            <IconComponent className="h-4 w-4 text-[#6B7280]" />
                          </div>
                          <span className="font-['Inter'] text-[0.875rem] text-[#111827]" style={{ fontWeight: 500 }}>
                            {asset.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {asset.status === "Verified" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/10 px-2.5 py-1 font-['Inter'] text-[0.75rem] text-[#10B981]"
                            style={{ fontWeight: 600 }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F59E0B]/10 px-2.5 py-1 font-['Inter'] text-[0.75rem] text-[#F59E0B]"
                            style={{ fontWeight: 600 }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-['Inter'] text-[0.875rem] text-[#111827]" style={{ fontWeight: 600 }}>
                          {asset.value}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#F3F4F6] px-2.5 py-1 font-['Inter'] text-[0.75rem] text-[#4B5563]"
                          style={{ fontWeight: 500 }}
                        >
                          {asset.type === "Real Estate" && <Home className="h-3 w-3" />}
                          {asset.type === "Private Equity" && <Briefcase className="h-3 w-3" />}
                          {asset.type === "Bond" && <Landmark className="h-3 w-3" />}
                          {asset.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {asset.chainlinkVerified ? (
                          <button className="flex items-center gap-1 font-['Inter'] text-[0.8125rem] text-[#3B82F6] transition-colors hover:text-[#1D4ED8]"
                            style={{ fontWeight: 500 }}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Attestation
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="font-['Inter'] text-[0.8125rem] text-[#D1D5DB]" style={{ fontWeight: 400 }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Log */}
        <ActivityLog entries={issuerActivityEntries} title="Activity Log" />
      </div>
    </div>
  );
}
