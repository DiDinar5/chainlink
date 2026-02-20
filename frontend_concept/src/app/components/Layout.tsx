import { Outlet } from "react-router";
import { Header } from "./Header";

export function Layout() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] font-['Inter']">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
