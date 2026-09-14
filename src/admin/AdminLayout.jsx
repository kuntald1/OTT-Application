import React, { useState } from "react";
import { Clapperboard, Users, LogOut, PlusCircle, CalendarCheck, Wallet, Tag, Megaphone, Radio, UserCog, Sparkles, Newspaper, Contact, MessagesSquare, HandCoins, CreditCard, Receipt, LifeBuoy, LayoutDashboard, BarChart3, GalleryHorizontal, Contact2, Landmark, FileText, Compass } from "lucide-react";
import { setAdminToken } from "./adminApi";
import AdminVideoReviewPage from "./AdminVideoReviewPage";
import AdminAccountsPage from "./AdminAccountsPage";
import AdminAddVideoPage from "./AdminAddVideoPage";
import AdminEventEnquiriesPage from "./AdminEventEnquiriesPage";
import AdminRevenuePage from "./AdminRevenuePage";
import AdminCategoriesPage from "./AdminCategoriesPage";
import AdminAdsPage from "./AdminAdsPage";
import AdminUsersPage from "./AdminUsersPage";
import AdminLiveStreamsPage from "./AdminLiveStreamsPage";
import AdminSpecialCategoriesPage from "./AdminSpecialCategoriesPage";
import AdminBlogsPage from "./AdminBlogsPage";
import AdminCommunityPage from "./AdminCommunityPage";
import AdminDonationRegistrationsPage from "./AdminDonationRegistrationsPage";
import AdminCastCrewPage from "./AdminCastCrewPage";
import AdminSubscriptionPlansPage from "./AdminSubscriptionPlansPage";
import AdminSubscriptionsPage from "./AdminSubscriptionsPage";
import AdminHelpCenterPage from "./AdminHelpCenterPage";
import AdminDashboardPage from "./AdminDashboardPage";
import AdminReportsPage from "./AdminReportsPage";
import AdminPageHeroesPage from "./AdminPageHeroesPage";
import AdminTheaterHeroSlidesPage from "./AdminTheaterHeroSlidesPage";
import AdminArchiveHeroSlidesPage from "./AdminArchiveHeroSlidesPage";
import AdminContentPolicyPage from "./AdminContentPolicyPage";
import AdminAdBannersPage from "./AdminAdBannersPage";
import AdminDiscoverySettingsPage from "./AdminDiscoverySettingsPage";

const COLORS = {
  bg: "radial-gradient(ellipse at top right, rgba(173,10,10,0.16) 0%, transparent 45%), radial-gradient(ellipse at bottom left, rgba(255,0,0,0.55) 0%, transparent 55%) rgb(48,3,18)",
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

  // Superadmin always sees everything. An ordinary admin whose
  // allowed_menu_keys is null/undefined is "unrestricted" (same as
  // before this feature existed — nobody gets silently locked out by
  // this rolling out); once a superadmin sets a specific list via
  // Admin Accounts > Manage Permissions, only those keys show.
  const canSeeMenu = (menuId) => {
    if (isSuperadmin) return true;
    if (currentAdmin.allowed_menu_keys == null) return true;
    return currentAdmin.allowed_menu_keys.includes(menuId);
  };

  // Lands on "dashboard" only if this admin can actually see it —
  // otherwise their first allowed menu, so a restricted admin never
  // opens onto a blank/hidden page.
  const [activePage, setActivePage] = useState(() =>
    canSeeMenu("dashboard") ? "dashboard" : (currentAdmin.allowed_menu_keys?.[0] || "dashboard")
  );
  // Set by a Dashboard card's "View details" drill-down — which
  // Reports & Analytics sub-tab to land on. Cleared once consumed so
  // navigating away and back to Reports normally doesn't keep forcing
  // a stale tab.
  const [reportsInitialTab, setReportsInitialTab] = useState(null);

  const handleDrillDown = (pageId, subTab) => {
    setActivePage(pageId);
    if (pageId === "reports" && subTab) setReportsInitialTab(subTab);
  };

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, visible: canSeeMenu("dashboard") },
    { id: "reports", label: "Reports & Analytics", icon: BarChart3, visible: canSeeMenu("reports") },
    { id: "videos", label: "Video Review", icon: Clapperboard, visible: canSeeMenu("videos") },
    { id: "add-video", label: "Add Video", icon: PlusCircle, visible: canSeeMenu("add-video") },
    { id: "cast-crew", label: "Cast/Crew Master", icon: Contact, visible: canSeeMenu("cast-crew") },
    { id: "special-categories", label: "Special Categories", icon: Sparkles, visible: canSeeMenu("special-categories") },
    { id: "blog", label: "Blog", icon: Newspaper, visible: canSeeMenu("blog") },
    { id: "community", label: "Community", icon: MessagesSquare, visible: canSeeMenu("community") },
    { id: "donation-registrations", label: "Donation Registrations", icon: HandCoins, visible: canSeeMenu("donation-registrations") },
    { id: "subscription-plans", label: "Subscription Plans", icon: CreditCard, visible: isSuperadmin },
    { id: "subscriptions", label: "Subscriptions", icon: Receipt, visible: canSeeMenu("subscriptions") },
    { id: "help-center", label: "Help Center", icon: LifeBuoy, visible: canSeeMenu("help-center") },
    { id: "page-heroes", label: "Page Heroes", icon: GalleryHorizontal, visible: canSeeMenu("page-heroes") },
    { id: "theater-hero-slides", label: "Ticketing Hero Slides", icon: Contact2, visible: canSeeMenu("theater-hero-slides") },
    { id: "archive-hero-slides", label: "Archive Hero Slides", icon: Landmark, visible: canSeeMenu("archive-hero-slides") },
    { id: "content-policy", label: "Content & Policy", icon: FileText, visible: canSeeMenu("content-policy") },
    { id: "ad-banners", label: "Ad Banners", icon: Megaphone, visible: canSeeMenu("ad-banners") },
    { id: "discovery-settings", label: "Discovery Rows", icon: Compass, visible: canSeeMenu("discovery-settings") },
    { id: "enquiries", label: "Event Enquiries", icon: CalendarCheck, visible: canSeeMenu("enquiries") },
    { id: "revenue", label: "Revenue Sharing", icon: Wallet, visible: canSeeMenu("revenue") },
    { id: "categories", label: "Categories", icon: Tag, visible: isSuperadmin },
    { id: "ads", label: "Ad Library", icon: Megaphone, visible: isSuperadmin },
    { id: "live", label: "Live Streaming", icon: Radio, visible: canSeeMenu("live") },
    { id: "users", label: "User Management", icon: UserCog, visible: canSeeMenu("users") },
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
            <h1 className="text-base font-semibold" style={{ color: COLORS.cream }}>THEOMY Admin</h1>
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
          {activePage === "dashboard" && <AdminDashboardPage onDrillDown={handleDrillDown} />}
          {activePage === "reports" && <AdminReportsPage key={reportsInitialTab} initialTab={reportsInitialTab} />}
          {activePage === "videos" && <AdminVideoReviewPage />}
          {activePage === "add-video" && <AdminAddVideoPage />}
          {activePage === "cast-crew" && <AdminCastCrewPage />}
          {activePage === "special-categories" && <AdminSpecialCategoriesPage />}
          {activePage === "blog" && <AdminBlogsPage />}
          {activePage === "community" && <AdminCommunityPage />}
          {activePage === "donation-registrations" && <AdminDonationRegistrationsPage />}
          {activePage === "subscription-plans" && isSuperadmin && <AdminSubscriptionPlansPage />}
          {activePage === "subscriptions" && <AdminSubscriptionsPage />}
          {activePage === "help-center" && <AdminHelpCenterPage />}
          {activePage === "page-heroes" && <AdminPageHeroesPage />}
          {activePage === "theater-hero-slides" && <AdminTheaterHeroSlidesPage />}
          {activePage === "archive-hero-slides" && <AdminArchiveHeroSlidesPage />}
          {activePage === "content-policy" && <AdminContentPolicyPage />}
          {activePage === "ad-banners" && <AdminAdBannersPage />}
          {activePage === "discovery-settings" && <AdminDiscoverySettingsPage />}
          {activePage === "enquiries" && <AdminEventEnquiriesPage />}
          {activePage === "revenue" && <AdminRevenuePage currentAdmin={currentAdmin} />}
          {activePage === "categories" && isSuperadmin && <AdminCategoriesPage />}
          {activePage === "ads" && isSuperadmin && <AdminAdsPage />}
          {activePage === "live" && <AdminLiveStreamsPage currentAdmin={currentAdmin} />}
          {activePage === "users" && <AdminUsersPage currentAdmin={currentAdmin} />}
          {activePage === "admins" && isSuperadmin && <AdminAccountsPage currentAdmin={currentAdmin} />}
        </div>
      </main>
    </div>
  );
}
