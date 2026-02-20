import { ShieldCheck, ExternalLink } from "lucide-react";

export function PrivacyBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#BFDBFE]/40 bg-gradient-to-r from-[#EFF6FF] via-[#F0F9FF] to-[#EFF6FF] p-6">
      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]" />
      
      {/* Subtle pattern */}
      <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#3B82F6]/5" />
      <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-[#10B981]/5" />

      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6]/10">
          <ShieldCheck className="h-6 w-6 text-[#3B82F6]" />
        </div>
        <div className="flex-1">
          <h3 className="font-['Inter'] text-[0.9375rem] text-[#1E40AF]" style={{ fontWeight: 600 }}>
            Privacy-First Verification
          </h3>
          <p className="mt-0.5 font-['Inter'] text-[0.8125rem] text-[#6B7280]" style={{ fontWeight: 400 }}>
            Verified via Chainlink CRE — No PII stored on-chain. Your identity data remains fully under your control.
          </p>
        </div>
        <button className="hidden items-center gap-1.5 rounded-lg border border-[#3B82F6]/20 bg-white px-3.5 py-2 font-['Inter'] text-[0.8125rem] text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/5 sm:flex"
          style={{ fontWeight: 500 }}
        >
          Learn More
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
