import React, { useEffect, useState } from "react";
import { Receipt, Search } from "lucide-react";
import { fetchAdminSubscriptionTransactions } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

const BUCKET_STYLE = {
  active: { background: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  expired: { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" },
  pending: { background: "rgba(212,175,55,0.12)", color: COLORS.gold },
  failed: { background: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminSubscriptionsPage() {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminSubscriptionTransactions({ statusFilter: tab, search })
      .then(setRows)
      .catch((err) => setError(err.message || "Couldn't load subscriptions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Receipt className="h-6 w-6" style={{ color: COLORS.gold }} /> Subscription Management
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        View and search active, expired, completed and failed customer subscriptions and related transactions.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={tab === t.id ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search by customer name or email…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Search className="h-3.5 w-3.5" /> Search
        </button>
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No transactions found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.payment_id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.cream }}>
                    {r.customer_name}
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={BUCKET_STYLE[r.bucket] || BUCKET_STYLE.pending}>
                      {r.bucket}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{r.customer_email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{r.currency} {r.total_amount}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{r.gateway}</p>
                </div>
              </div>
              <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                {r.plan_name} — {r.duration_label} · {r.screens} screen{r.screens === 1 ? "" : "s"} · {formatDate(r.created_at)}
                {r.subscription_expires_at && ` · expires ${formatDate(r.subscription_expires_at)}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
