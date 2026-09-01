import React, { useEffect, useState } from "react";
import { LayoutDashboard, Users, CreditCard, Clapperboard, CalendarCheck, Receipt, IndianRupee, Clock } from "lucide-react";
import { fetchAdminDashboardSummary } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

function Card({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: accent || COLORS.gold }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
      </div>
      <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{sub}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminDashboardSummary()
      .then(setData)
      .catch((err) => setError(err.message || "Couldn't load the dashboard."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <LayoutDashboard className="h-6 w-6" style={{ color: COLORS.gold }} /> Dashboard
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        A summary of customers, subscriptions, content, events, and revenue across theomy.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : error ? (
        <p className="text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card icon={Users} label="Customers" value={data.total_customers} sub={`${data.active_customers} active`} />
          <Card icon={CreditCard} label="Subscriptions" value={data.active_subscriptions} sub={`${data.expired_subscriptions} expired`} accent="#6FCF97" />
          <Card icon={Clapperboard} label="OTT Content" value={data.published_videos} sub={`${data.pending_review_videos} pending review`} />
          <Card icon={CalendarCheck} label="Theatre Events" value={data.approved_events} sub={`${data.pending_enquiries} pending enquiries`} />
          <Card icon={Receipt} label="Transactions" value={data.total_transactions} sub="successful payments" />
          <Card icon={IndianRupee} label="Revenue (INR)" value={`₹${data.total_revenue_rupees}`} sub="from successful INR payments" accent="#6FCF97" />
          <Card icon={Clock} label="Pending Enquiries" value={data.pending_enquiries} sub="awaiting review" accent="#f87171" />
        </div>
      )}
    </div>
  );
}
