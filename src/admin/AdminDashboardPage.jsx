import React, { useEffect, useState } from "react";
import { LayoutDashboard, Users, UserCog, CreditCard, Clapperboard, CalendarCheck, IndianRupee, Clock, Gift, Wallet } from "lucide-react";
import { fetchAdminDashboardSummary } from "./adminApi";
import DateRangePicker, { defaultDateRange } from "./DateRangePicker";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

function Card({ icon: Icon, label, value, sub, accent, onClick }) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className="rounded-xl p-4 text-left transition-transform"
      style={{
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(245,235,221,0.1)",
        cursor: clickable ? "pointer" : "default",
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.borderColor = "rgba(212,175,55,0.4)"; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.borderColor = "rgba(245,235,221,0.1)"; }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: accent || COLORS.gold }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
      </div>
      <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{sub}</p>}
      {clickable && <p className="mt-1.5 text-[11px] font-medium" style={{ color: COLORS.gold }}>View details →</p>}
    </button>
  );
}

export default function AdminDashboardPage({ onDrillDown }) {
  const [dateRange, setDateRange] = useState(defaultDateRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchAdminDashboardSummary(dateRange)
      .then(setData)
      .catch((err) => setError(err.message || "Couldn't load the dashboard."))
      .finally(() => setLoading(false));
  }, [dateRange]);

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <LayoutDashboard className="h-6 w-6" style={{ color: COLORS.gold }} /> Dashboard
      </h1>
      <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        A summary of users, subscriptions, content, events, and revenue across theomy. Click any card for the full breakdown.
      </p>

      <div className="mb-6">
        <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={setDateRange} />
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : error ? (
        <p className="text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card icon={Users} label="Users" value={data.total_users} sub={`${data.active_customers} active (all roles)`} onClick={() => onDrillDown?.("reports", "customers")} />
          <Card icon={UserCog} label="Plays Organisers" value={data.total_organisers} onClick={() => onDrillDown?.("reports", "customers")} />
          <Card icon={CreditCard} label="Subscriptions" value={data.active_subscriptions} sub={`${data.expired_subscriptions} expired`} accent="#6FCF97" onClick={() => onDrillDown?.("reports", "subscriptions")} />
          <Card icon={Clapperboard} label="OTT Content" value={data.published_videos} sub={`${data.pending_review_videos} pending review`} onClick={() => onDrillDown?.("reports", "content")} />
          <Card icon={CalendarCheck} label="Theatre Events" value={data.approved_events} sub={`${data.pending_enquiries} pending enquiries`} onClick={() => onDrillDown?.("reports", "enquiries")} />
          <Card icon={IndianRupee} label="Revenue (INR)" value={`₹${data.total_revenue_rupees}`} sub="from successful subscription payments" accent="#6FCF97" onClick={() => onDrillDown?.("reports", "revenue")} />
          <Card icon={Clock} label="Pending Enquiries" value={data.pending_enquiries} sub="theatre events awaiting approval" accent="#f87171" onClick={() => onDrillDown?.("reports", "enquiries")} />
          <Card icon={Gift} label="Total Rewards" value={data.total_reward_points} sub="reward points balance, all users" />
          <Card icon={Wallet} label="Revenue Pending Pay" value={`₹${data.revenue_pending_pay_rupees}`} sub="owed to creators, not yet withdrawn" accent="#5B9BD5" onClick={() => onDrillDown?.("revenue")} />
        </div>
      )}
    </div>
  );
}
