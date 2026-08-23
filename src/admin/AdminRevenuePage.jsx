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

  // Custom confirmation dialog — replaces window.confirm/window.prompt's
  // unbranded browser popup with theomy's own styling. `action` is
  // "markPaid" or "reject"; `note` is optional for markPaid, required
  // for reject (the rejection reason the creator will see by email).
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [dialogNote, setDialogNote] = useState("");
  const [dialogError, setDialogError] = useState("");

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

  // Opens the custom confirmation dialog instead of window.confirm/
  // window.prompt — w is the full withdrawal row so the dialog can show
  // amount/creator context, not just a bare browser popup.
  const openConfirmDialog = (action, w) => {
    setConfirmDialog({ action, id: w.id, label: `₹${w.amount_rupees} — ${w.creator_name}` });
    setDialogNote("");
    setDialogError("");
  };

  const handleDialogConfirm = async () => {
    if (!confirmDialog) return;
    if (confirmDialog.action === "reject" && !dialogNote.trim()) {
      setDialogError("A reason is required — the creator sees this by email.");
      return;
    }
    setActioningId(confirmDialog.id);
    setError("");
    try {
      if (confirmDialog.action === "markPaid") {
        await markWithdrawalPaid(confirmDialog.id, dialogNote.trim() || undefined);
      } else {
        await rejectWithdrawal(confirmDialog.id, dialogNote.trim());
      }
      loadWithdrawals();
      setConfirmDialog(null);
    } catch (err) {
      setDialogError(err.message || "Something went wrong. Please try again.");
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
                          onClick={() => openConfirmDialog("markPaid", w)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                          style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97" }}
                        >
                          <Banknote className="h-3.5 w-3.5" /> Mark Paid
                        </button>
                        {w.status === "pending" && (
                          <button
                            type="button"
                            disabled={actioningId === w.id}
                            onClick={() => openConfirmDialog("reject", w)}
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

      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>
              {confirmDialog.action === "markPaid" ? "Confirm payment sent" : "Reject withdrawal"}
            </h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              {confirmDialog.label}
            </p>
            <p className="mt-3 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
              {confirmDialog.action === "markPaid"
                ? "Confirm the manual payment (bank transfer/UPI) has actually gone out to the creator. They'll get an email and WhatsApp confirmation."
                : "The amount will be refunded to the creator's available balance, and they'll be notified by email with your reason below."}
            </p>

            <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
              {confirmDialog.action === "markPaid" ? "Note (optional)" : "Reason (required — shown to the creator)"}
            </label>
            <textarea
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              placeholder={confirmDialog.action === "markPaid" ? "e.g. Paid via UPI, ref #123456" : "e.g. Bank details unclear, please resubmit"}
            />
            {dialogError && <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{dialogError}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
                style={{ color: "rgba(245,235,221,0.6)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actioningId === confirmDialog.id}
                onClick={handleDialogConfirm}
                className="rounded-full px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: confirmDialog.action === "markPaid" ? "rgba(111,207,151,0.85)" : "rgba(248,113,113,0.85)",
                  color: "#0a0104",
                }}
              >
                {actioningId === confirmDialog.id
                  ? "Processing…"
                  : confirmDialog.action === "markPaid" ? "Confirm Paid" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
