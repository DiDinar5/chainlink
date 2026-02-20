import {
  CheckCircle,
  Lock,
  Home,
  Landmark,
  FileText,
  Fingerprint,
  ScanFace,
  Globe,
  ChevronRight,
} from "lucide-react";

interface AccessLevelCardProps {
  level: number;
  title: string;
  providers: string[];
  features: string[];
  accessRate: number;
  isActive: boolean;
  assetIcons?: React.ReactNode[];
}

function ProviderBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 font-['Inter'] text-[0.75rem] text-[#4B5563]"
      style={{ fontWeight: 500 }}
    >
      {name === "World ID" ? (
        <Globe className="h-3.5 w-3.5 text-[#6366F1]" />
      ) : name === "Persona" ? (
        <ScanFace className="h-3.5 w-3.5 text-[#8B5CF6]" />
      ) : (
        <Fingerprint className="h-3.5 w-3.5 text-[#3B82F6]" />
      )}
      {name}
    </span>
  );
}

export function AccessLevelCard({
  level,
  title,
  providers,
  features,
  accessRate,
  isActive,
  assetIcons,
}: AccessLevelCardProps) {
  const levelColors = {
    1: { bg: "bg-[#10B981]", text: "text-[#10B981]", light: "bg-[#10B981]/10" },
    2: { bg: "bg-[#F59E0B]", text: "text-[#F59E0B]", light: "bg-[#F59E0B]/10" },
    3: { bg: "bg-[#D97706]", text: "text-[#D97706]", light: "bg-[#D97706]/10" },
  };

  const colors = levelColors[level as keyof typeof levelColors] || levelColors[1];

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all ${
        isActive
          ? "border-[#10B981]/30 bg-white shadow-sm"
          : "border-[#E5E7EB] bg-white/80 opacity-90 hover:opacity-100 hover:shadow-sm"
      }`}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-0 h-full w-1 bg-[#10B981]" />
      )}

      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        {/* Left Content */}
        <div className="flex-1 space-y-4">
          {/* Level badge + status */}
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-['Inter'] text-[0.75rem] ${colors.light} ${colors.text}`}
              style={{ fontWeight: 600 }}
            >
              {isActive ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              Level {level}
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 font-['Inter'] text-[0.6875rem] text-[#10B981]"
                style={{ fontWeight: 600 }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                Active
              </span>
            )}
            {!isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2.5 py-0.5 font-['Inter'] text-[0.6875rem] text-[#9CA3AF]"
                style={{ fontWeight: 500 }}
              >
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className={`font-['Inter'] text-[1.125rem] ${isActive ? 'text-[#111827]' : 'text-[#6B7280]'}`}
            style={{ fontWeight: 600 }}
          >
            {title}
          </h3>

          {/* Providers */}
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <ProviderBadge key={p} name={p} />
            ))}
          </div>

          {/* Features */}
          <ul className="space-y-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 font-['Inter'] text-[0.8125rem] text-[#4B5563]" style={{ fontWeight: 400 }}>
                <CheckCircle className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#10B981]' : 'text-[#D1D5DB]'}`} />
                {f}
              </li>
            ))}
          </ul>

          {/* Asset class icons (Level 1 only) */}
          {assetIcons && (
            <div className="flex items-center gap-3 pt-1">
              <span className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>
                Asset Classes:
              </span>
              <div className="flex gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7]">
                  <Home className="h-4 w-4 text-[#D97706]" />
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7]">
                  <Landmark className="h-4 w-4 text-[#D97706]" />
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE]">
                  <FileText className="h-4 w-4 text-[#3B82F6]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side — Progress + Action */}
        <div className="flex min-w-[240px] flex-col items-end gap-4">
          {/* Progress Section */}
          <div className="w-full rounded-xl bg-[#F9FAFB] p-4">
            <div className="flex items-center justify-between">
              <span className="font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>
                Avg. RWA access rate
              </span>
              <span className={`font-['Inter'] text-[1.25rem] ${isActive ? 'text-[#10B981]' : 'text-[#6B7280]'}`}
                style={{ fontWeight: 700 }}
              >
                {accessRate}%
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isActive ? 'bg-[#10B981]' : 'bg-[#9CA3AF]'
                }`}
                style={{ width: `${accessRate}%` }}
              />
            </div>
          </div>

          {/* CTA Button */}
          {!isActive && (
            <button className="flex items-center gap-2 rounded-lg border border-[#2D3748] bg-white px-4 py-2.5 font-['Inter'] text-[0.8125rem] text-[#2D3748] transition-all hover:bg-[#2D3748] hover:text-white"
              style={{ fontWeight: 600 }}
            >
              Unlock Level {level}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {isActive && (
            <div className="flex items-center gap-2 rounded-lg bg-[#10B981]/10 px-4 py-2.5 font-['Inter'] text-[0.8125rem] text-[#10B981]"
              style={{ fontWeight: 600 }}
            >
              <CheckCircle className="h-4 w-4" />
              Verification Complete
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
