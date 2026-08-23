import React, { useEffect, useState } from "react";
import { Wallet, BarChart3, Check, X, Banknote } from "lucide-react";
import {
  fetchAdminWithdrawals, approveWithdrawal, markWithdrawalPaid, rejectWithdrawal,
  fetchAdminContentPerformance,
} from "./adminApi";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_STYLES = {
  pending: { bg: "rgba(255,255,255,0.08)", color: "rgba(245,235,221,0.6)" },
  approved: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  paid: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminRevenuePage() {
  // Revenue Sharing Management — two sub-tabs: withdrawal request &
  // payment tracking (manual admin payout, since RazorpayX payout
  // automation isn't wired up yet), and content performance analytics
  // (views/revenue per video, platform-wide).
  const [tab, setTab] = useState("withdrawals");

  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actioningId, setActioningId] = useState(null);
  const [error, setError] = useState("");

  const [performance, setPerformance] = useState([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  const loadWithdrawals = () => {
    setWithdrawalsLoading(true);
    fetchAdminWithdrawals(statusFilter || undefined)
      .then(setWithdrawals)
      .catch(() => setWithdrawals([]))
      .finally(() => setWithdrawalsLoading(false));
  };

  useEffect(() => {
    if (tab === "withdrawals") loadWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  useEffect(() => {
    if (tab !== "performance") return;
    setPerformanceLoading(true);
    fetchAdminContentPerformance()
      .then(setPerformance)
      .catch(() => setPerformance([]))
      .finally(() => setPerformanceLoading(false));
  }, [tab]);

  const handleApprove = async (id) => {
    setActioningId(id);
    setError("");
    try {
      await approveWithdrawal(id);
      loadWithdrawals();
    } catch (err) {
      setError(err.message || "Couldn't approve this withdrawal.");
    } finally {
      setActioningId(null);
    }
  };

  const handleMarkPaid = async (id) => {
    if (!window.confirm("Confirm the manual payment has actually gone out to the creator?")) return;
    setActioningId(id);
    setError("");
    try {
      await markWithdrawalPaid(id);
      loadWithdrawals();
    } catch (err) {
      setError(err.message || "Couldn't mark this withdrawal paid.");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id) => {
    const note = window.prompt("Reason for rejecting this withdrawal (required — the amount will be refunded to the creator's balance):");
    if (!note) return;
    setActioningId(id);
    setError("");
    try {
      await rejectWithdrawal(id, note);
      loadWithdrawals();
    } catch (err) {
      setError(err.message || "Couldn't reject this withdrawal.");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Revenue Sharing Management</h2>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        View-minute based creator revenue, withdrawal payouts (paid manually — RazorpayX automation is pending KYC/eligibility), and content performance.
      </p>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("withdrawals")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{
            background: tab === "withdrawals" ? "rgba(212,175,55,0.12)" : "transparent",
            color: tab === "withdrawals" ? COLORS.gold : "rgba(245,235,221,0.6)",
          }}
        >
          <Wallet className="h-4 w-4" /> Withdrawal Requests
        </button>
        <button
          type="button"
          onClick={() => setTab("performance")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{
            background: tab === "performance" ? "rgba(212,175,55,0.12)" : "transparent",
            color: tab === "performance" ? COLORS.gold : "rgba(245,235,221,0.6)",
          }}
        >
          <BarChart3 className="h-4 w-4" /> Content Performance
        </button>
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {tab === "withdrawals" ? (
        <div>
          <div className="mb-4 flex gap-2">
            {["pending", "approved", "paid", "rejected", ""].map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setStatusFilter(s)}
                className="rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors"
                style={{
                  background: statusFilter === s ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.06)",
                  color: statusFilter === s ? COLORS.gold : "rgba(245,235,221,0.6)",
                }}
              >
                {s || "All"}
              </button>
            ))}
          </div>

          {withdrawalsLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : withdrawals.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No withdrawal requests here.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {withdrawals.map((w) => {
                const style = STATUS_STYLES[w.status] || STATUS_STYLES.pending;
                return (
                  <div
                    key={w.id}
                    className="rounded-xl p-4"
                    style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                          ₹{w.amount_rupees} — {w.creator_name}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                          {w.creator_email} · Requested {formatDate(w.requested_at)}
                          {w.processed_at && ` · Processed ${formatDate(w.processed_at)}`}
                        </p>
                        {w.admin_note && (
                          <p className="mt-1 text-xs italic" style={{ color: "rgba(245,235,221,0.5)" }}>Note: {w.admin_note}</p>
                        )}
                      </div>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {w.status}
                      </span>
                    </div>

                    {(w.status === "pending" || w.status === "approved") && (
                      <div className="mt-3 flex gap-2">
                        {w.status === "pending" && (
                          <button
                            type="button"
                            disabled={actioningId === w.id}
                            onClick={() => handleApprove(w.id)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                            style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actioningId === w.id}
                          onClick={() => handleMarkPaid(w.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                          style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97" }}
                        >
                          <Banknote className="h-3.5 w-3.5" /> Mark Paid
                        </button>
                        {w.status === "pending" && (
                          <button
                            type="button"
                            disabled={actioningId === w.id}
                            onClick={() => handleReject(w.id)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                            style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          {performanceLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : performance.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No published videos yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: COLORS.panel }}>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Video</th>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Creator</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Viewers</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Watch Minutes</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Gross Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Creator Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((row) => (
                    <tr key={row.video_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td className="px-4 py-2.5" style={{ color: COLORS.cream }}>{row.title}</td>
                      <td className="px-4 py-2.5" style={{ color: "rgba(245,235,221,0.6)" }}>{row.creator_name}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{row.unique_viewers}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{row.total_watch_minutes}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>₹{row.gross_revenue_rupees}</td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: COLORS.gold }}>₹{row.creator_earned_rupees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
