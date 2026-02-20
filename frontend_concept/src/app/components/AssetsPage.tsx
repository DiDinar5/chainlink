import {
  Home,
  Building2,
  Briefcase,
  FileText,
  Landmark,
  TrendingUp,
  CheckCircle,
  Lock,
  ExternalLink,
  Search,
  Filter,
} from "lucide-react";

const allAssets = [
  {
    id: "1",
    name: "Parq Ubud Villa",
    issuer: "Binaryx Protocol DAO LLC",
    value: "$300,000",
    type: "Real Estate",
    icon: Home,
    requiredLevel: 1,
    accessible: true,
    apy: "8.2%",
  },
  {
    id: "2",
    name: "Jakarta Tech Hub",
    issuer: "Binaryx Protocol DAO LLC",
    value: "$1,200,000",
    type: "Real Estate",
    icon: Building2,
    requiredLevel: 1,
    accessible: true,
    apy: "6.5%",
  },
  {
    id: "3",
    name: "Binaryx Equity Fund I",
    issuer: "Binaryx Protocol DAO LLC",
    value: "$500,000",
    type: "Private Equity",
    icon: Briefcase,
    requiredLevel: 2,
    accessible: false,
    apy: "12.4%",
  },
  {
    id: "4",
    name: "Green Energy Bond 2026",
    issuer: "Binaryx Protocol DAO LLC",
    value: "$250,000",
    type: "Bond",
    icon: FileText,
    requiredLevel: 1,
    accessible: true,
    apy: "5.8%",
  },
  {
    id: "5",
    name: "Singapore Condo Trust",
    issuer: "CapitalBridge DAO",
    value: "$750,000",
    type: "Real Estate",
    icon: Building2,
    requiredLevel: 2,
    accessible: false,
    apy: "7.1%",
  },
  {
    id: "6",
    name: "DeFi Treasury Note",
    issuer: "OnChain Finance",
    value: "$100,000",
    type: "Bond",
    icon: Landmark,
    requiredLevel: 3,
    accessible: false,
    apy: "14.2%",
  },
];

export function AssetsPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Inter'] text-[1.75rem] tracking-tight text-[#111827]" style={{ fontWeight: 700 }}>
              RWA Assets
            </h1>
            <p className="mt-1 font-['Inter'] text-[0.9375rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
              Browse verified real-world assets available for investment
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5">
              <Search className="h-4 w-4 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Search assets..."
                className="w-40 bg-transparent font-['Inter'] text-[0.8125rem] text-[#374151] placeholder:text-[#9CA3AF] focus:outline-none"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5 font-['Inter'] text-[0.8125rem] text-[#6B7280] transition-colors hover:bg-[#F3F4F6]"
              style={{ fontWeight: 500 }}
            >
              <Filter className="h-4 w-4" />
              Filter
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Total Assets</p>
            <p className="mt-1 font-['Inter'] text-[1.5rem] text-[#111827]" style={{ fontWeight: 700 }}>18</p>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Accessible</p>
            <p className="mt-1 font-['Inter'] text-[1.5rem] text-[#10B981]" style={{ fontWeight: 700 }}>12</p>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Total Value</p>
            <p className="mt-1 font-['Inter'] text-[1.5rem] text-[#111827]" style={{ fontWeight: 700 }}>$3.1M</p>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <p className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Avg. APY</p>
            <p className="mt-1 font-['Inter'] text-[1.5rem] text-[#3B82F6]" style={{ fontWeight: 700 }}>9.03%</p>
          </div>
        </div>

        {/* Asset Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allAssets.map((asset) => {
            const IconComp = asset.icon;
            return (
              <div
                key={asset.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-5 transition-all ${
                  asset.accessible
                    ? "border-[#E5E7EB] hover:border-[#10B981]/30 hover:shadow-md"
                    : "border-[#E5E7EB] opacity-75"
                }`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3F4F6]">
                    <IconComp className="h-5 w-5 text-[#6B7280]" />
                  </div>
                  {asset.accessible ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-0.5 font-['Inter'] text-[0.6875rem] text-[#10B981]"
                      style={{ fontWeight: 600 }}
                    >
                      <CheckCircle className="h-3 w-3" />
                      Accessible
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2 py-0.5 font-['Inter'] text-[0.6875rem] text-[#9CA3AF]"
                      style={{ fontWeight: 500 }}
                    >
                      <Lock className="h-3 w-3" />
                      Level {asset.requiredLevel}
                    </span>
                  )}
                </div>

                <h3 className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 600 }}>
                  {asset.name}
                </h3>
                <p className="mt-0.5 font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 400 }}>
                  {asset.issuer}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-[#F3F4F6] pt-4">
                  <div>
                    <p className="font-['Inter'] text-[0.6875rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Value</p>
                    <p className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 700 }}>{asset.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-['Inter'] text-[0.6875rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>Est. APY</p>
                    <p className="font-['Inter'] text-[0.9375rem] text-[#10B981]" style={{ fontWeight: 700 }}>{asset.apy}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#F3F4F6] px-2 py-0.5 font-['Inter'] text-[0.6875rem] text-[#6B7280]"
                    style={{ fontWeight: 500 }}
                  >
                    {asset.type}
                  </span>
                  {asset.accessible && (
                    <button className="flex items-center gap-1 font-['Inter'] text-[0.75rem] text-[#3B82F6] hover:text-[#1D4ED8]"
                      style={{ fontWeight: 500 }}
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      View Details
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
