import React from "react";
import { Link2Off } from "lucide-react";
import { setTokenSource } from "../api";
import { getAdminToken } from "./adminApi";
import MyVideoListPage from "../Profile/MyVideoListPage";
import RevenuePage from "../Profile/RevenuePage";
import EventEnquiryPage from "../Profile/EventEnquiryPage";

// The three pages a Plays Organiser gets inside /admin — "Organiser Add
// Video", "Revenue", "Organiser Event Listing" — are the SAME pages (same
// fields, same APIs) the organiser uses on the main site (My Video List,
// Revenue, Event Listing Enquiry), not rewrites. They call the site's own
// user APIs, and for that they need to send the ADMIN token: the backend
// (deps.get_current_user) treats a plays_organiser admin token as the site
// account it is linked to (admin_users.linked_user_id), and only for the
// endpoints of a menu the role was granted.
//
// The override is limited to /admin URLs, so the main site keeps using its own
// token exactly as before. AdminApp is only ever mounted on /admin.
setTokenSource(() => (window.location.pathname.startsWith("/admin") ? getAdminToken() : undefined));

// The site pages draw their own full-screen dark canvas and leave room for the
// site's top bar; inside the admin shell they should just fill the content
// area.
const EMBED_CSS = `
.organiser-embed > div { min-height: 0 !important; background: transparent !important; }
.organiser-embed main { max-width: none !important; padding: 0 !important; }
`;

function NotLinked() {
  return (
    <div className="rounded-2xl p-6" style={{ background: "#150307", border: "1px solid rgba(255,255,255,0.08)" }}>
      <Link2Off className="mb-3 h-6 w-6" style={{ color: "#D4AF37" }} />
      <h2 className="mb-1 text-base font-semibold" style={{ color: "#f5ebdd" }}>This admin account is not linked to a site account</h2>
      <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
        Videos, revenue and event enquiries belong to a site account, and this login doesn't have one. Please ask the
        superadmin to open User Management and use "Give admin access" on your organiser account.
      </p>
    </div>
  );
}

function Frame({ currentAdmin, children }) {
  if (!currentAdmin?.has_site_account) return <NotLinked />;
  return (
    <div className="organiser-embed">
      <style>{EMBED_CSS}</style>
      {children}
    </div>
  );
}

export function OrganiserAddVideoPage({ currentAdmin }) {
  return <Frame currentAdmin={currentAdmin}><MyVideoListPage /></Frame>;
}

export function OrganiserRevenuePage({ currentAdmin }) {
  return <Frame currentAdmin={currentAdmin}><RevenuePage hideViewerDetails /></Frame>;
}

export function OrganiserEventListingPage({ currentAdmin }) {
  return (
    <Frame currentAdmin={currentAdmin}>
      <EventEnquiryPage defaultContact={{ name: currentAdmin?.name, email: currentAdmin?.email }} />
    </Frame>
  );
}
