import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/auth";

const NAV = [
  { to: "/", label: "Genel Bakış", icon: "📊", end: true },
  { to: "/campaigns", label: "Kampanyalar", icon: "📣" },
  { to: "/segments", label: "Segmentler", icon: "🎯" },
  { to: "/automations", label: "Otomasyonlar", icon: "🤖" },
  { to: "/contacts", label: "Kontaklar", icon: "👥" },
  { to: "/settings", label: "API Ayarları", icon: "⚙️", adminOnly: true },
];

const ROLE_LABEL: Record<string, string> = { admin: "Yönetici", marketer: "Pazarlama", viewer: "İzleyici" };

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

  // Browser sekme başlığı: "<aktif sekme> · Mavera Marketing Hub"
  useEffect(() => {
    const active = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => loc.pathname === n.to || (!n.end && loc.pathname.startsWith(n.to) && n.to !== "/"));
    document.title = active ? `${active.label} · Mavera Marketing Hub` : "Mavera Marketing Hub";
  }, [loc.pathname]);

  const SidebarContent = (
    <>
      <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">M</div>
        <span className="font-semibold text-white">Marketing Hub</span>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? "bg-indigo-600 text-white font-medium shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <span className="text-base">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">{user?.dernek}</div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-slate-900 flex-col shrink-0">{SidebarContent}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 flex flex-col shadow-xl">{SidebarContent}</aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 gap-3 sticky top-0 z-30">
          <button
            className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
            onClick={() => setOpen(true)}
            aria-label="Menü"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
          </button>
          <div className="md:hidden font-semibold text-slate-800">Marketing Hub</div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{user?.email}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</div>
            </div>
            <button
              onClick={() => { logout(); nav("/login"); }}
              className="text-sm text-slate-600 hover:text-red-600 transition-colors"
            >
              Çıkış
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
