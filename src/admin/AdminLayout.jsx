import React, { useState } from "react";
import { Clapperboard, Users, LogOut, PlusCircle, CalendarCheck } from "lucide-react";
import { setAdminToken } from "./adminApi";
import AdminVideoReviewPage from "./AdminVideoReviewPage";
import AdminAccountsPage from "./AdminAccountsPage";
import AdminAddVideoPage from "./AdminAddVideoPage";
import AdminEventEnquiriesPage from "./AdminEventEnquiriesPage";

const COLORS = {
  bg: "#0a0104",
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

// Real sidebar navigation — each section is its own page with its own
// data fetching, not one long scrolling dashboard. New sections (Event
// Enquiries, Withdrawal Requests, Config settings, etc.) get added here
// as additional nav items in future phases, each with room to grow its
// own set of features without crowding everything else.
export default function AdminLayout({ currentAdmin, onLogout }) {
  const isSuperadmin = currentAdmin.role === "superadmin";
  const [activePage, setActivePage] = useState("videos");

  const NAV_ITEMS = [
    { id: "videos", label: "Video Review", icon: Clapperboard, visible: true },
    { id: "add-video", label: "Add Video", icon: PlusCircle, visible: true },
    { id: "enquiries", label: "Event Enquiries", icon: CalendarCheck, visible: true },
    { id: "admins", label: "Admin Accounts", icon: Users, visible: isSuperadmin },
  ];

  const handleLogout = () => {
    setAdminToken(null);
    onLogout();
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }} className="flex">
      {/* Sidebar */}
      <aside
        className="flex w-56 flex-shrink-0 flex-col justify-between px-4 py-6"
        style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div>
          <div className="mb-8 px-2">
            <h1 className="text-base font-semibold" style={{ color: COLORS.cream }}>theomy Admin</h1>
            <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
              {currentAdmin.name} · <span className="capitalize">{currentAdmin.role}</span>
            </p>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.filter((item) => item.visible).map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors"
                  style={{
                    background: active ? "rgba(212,175,55,0.12)" : "transparent",
                    color: active ? COLORS.gold : "rgba(245,235,221,0.7)",
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-white/5"
          style={{ color: "rgba(245,235,221,0.6)" }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Log out
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-3xl">
          {activePage === "videos" && <AdminVideoReviewPage />}
          {activePage === "add-video" && <AdminAddVideoPage />}
          {activePage === "enquiries" && <AdminEventEnquiriesPage />}
          {activePage === "admins" && isSuperadmin && <AdminAccountsPage currentAdmin={currentAdmin} />}
        </div>
      </main>
    </div>
  );
}
