import { Terminal, ArrowUpRight, Clock } from "lucide-react";

interface LogEntry {
  id: string;
  message: string;
  timestamp: string;
  type: "attestation" | "verification" | "access" | "asset";
}

interface ActivityLogProps {
  entries: LogEntry[];
  title?: string;
}

export function ActivityLog({ entries, title = "Recent Activity" }: ActivityLogProps) {
  const typeColors: Record<string, string> = {
    attestation: "text-[#3B82F6]",
    verification: "text-[#10B981]",
    access: "text-[#8B5CF6]",
    asset: "text-[#F59E0B]",
  };

  const typeBg: Record<string, string> = {
    attestation: "bg-[#3B82F6]/10",
    verification: "bg-[#10B981]/10",
    access: "bg-[#8B5CF6]/10",
    asset: "bg-[#F59E0B]/10",
  };

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white">
      <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D3748]">
          <Terminal className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-['Inter'] text-[0.9375rem] text-[#111827]" style={{ fontWeight: 600 }}>
          {title}
        </h3>
        <span className="ml-auto font-['Inter'] text-[0.75rem] text-[#9CA3AF]" style={{ fontWeight: 500 }}>
          Chainlink CRE Transactions
        </span>
      </div>

      <div className="divide-y divide-[#F3F4F6]">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-[#F9FAFB]"
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${typeBg[entry.type]}`}>
              <ArrowUpRight className={`h-3.5 w-3.5 ${typeColors[entry.type]}`} />
            </div>
            <code className="flex-1 font-['JetBrains_Mono'] text-[0.8125rem] text-[#374151]" style={{ fontWeight: 400 }}>
              {entry.message}
            </code>
            <div className="flex items-center gap-1.5 text-[#9CA3AF]">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-['JetBrains_Mono'] text-[0.6875rem]" style={{ fontWeight: 400 }}>
                {entry.timestamp}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
