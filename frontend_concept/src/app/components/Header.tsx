import { Link, useLocation } from "react-router";
import { Shield, Layers } from "lucide-react";

export function Header() {
  const location = useLocation();

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

        {/* CTA */}
        <button className="flex items-center gap-2 rounded-lg bg-[#2D3748] px-5 py-2.5 font-['Inter'] text-[0.875rem] text-white shadow-sm transition-all hover:bg-[#1a202c] hover:shadow-md"
          style={{ fontWeight: 600 }}
        >
          <Shield className="h-4 w-4" />
          Get Access
        </button>
      </div>
    </header>
  );
}
