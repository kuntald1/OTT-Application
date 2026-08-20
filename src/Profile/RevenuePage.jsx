import React, { useEffect, useState } from "react";
import { ArrowLeft, IndianRupee, TrendingUp, Wallet, Clock } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { fetchRevenueRate, fetchRevenueSummary, requestWithdrawal, fetchWithdrawalHistory } from "../api";

// ---------------------------------------------------------------------------
// Revenue — Content Creator / Plays Organiser only.
//
// REAL, from the database: the per-minute rate, the creator's total
// earned / available balance (from creator_earnings — seeded manually via
// SQL for now, since theomy has no real watch-time tracking pipeline yet),
// and withdrawal requests (fully real — submitting one actually reserves
// funds and creates a row, visible in History with its status).
//
// Withdrawal status changes (pending → approved/rejected/paid) will be
// made from the future admin panel at theomy.com/admin — for now, status
// only changes if updated directly in the database.
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: "#D4AF37" },
  approved: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  paid: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function RevenuePage({ onBack }) {
  const [rate, setRate] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAll = () => {
    setSummaryLoading(true);
    fetchRevenueSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setSummaryLoading(false));

    setHistoryLoading(true);
    fetchWithdrawalHistory().then(setHistory).catch(() => setHistory([])).finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    fetchRevenueRate().then(setRate).catch(() => setRate(null));
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitWithdrawal = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setError("");
    setSubmitting(true);
    try {
      await requestWithdrawal(amt);
      setAmount("");
      setShowWithdrawForm(false);
      loadAll();
    } catch (err) {
      setError(err.message || "Couldn't submit withdrawal request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Revenue</h1>
        <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Views, withdrawal requests & payment tracking. Content performance analytics.
        </p>

        <div className="mb-6 rounded-2xl p-5" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Current revenue-share rate</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLORS.gold }}>
            {rate ? rate.rate_display : "Loading…"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            You earn this rate for every minute a viewer watches your content. Set by theomy, subject to change.
          </p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <TrendingUp className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>
              {summaryLoading ? "…" : `₹${summary?.total_earned_rupees ?? 0}`}
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Total earned</p>
          </div>
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <IndianRupee className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>
              {summaryLoading ? "…" : `₹${summary?.available_balance_rupees ?? 0}`}
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Available to withdraw</p>
          </div>
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <Clock className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>
              {summaryLoading ? "…" : `₹${summary?.pending_withdrawals_rupees ?? 0}`}
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Pending withdrawal</p>
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: COLORS.cream }}>Withdrawal requests</h2>
          <button
            type="button"
            onClick={() => { setShowWithdrawForm((v) => !v); setError(""); }}
            disabled={!summary || summary.available_balance_rupees <= 0}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <Wallet className="h-3.5 w-3.5" /> Request withdrawal
          </button>
        </div>

        {showWithdrawForm && (
          <div className="mb-6 rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.2)" }}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
              Amount (₹) — up to ₹{summary?.available_balance_rupees ?? 0} available
            </label>
            <input
              type="number"
              min="1"
              max={summary?.available_balance_rupees ?? 0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            {error && <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
            <div className="mt-3 flex justify-end gap-3">
              <button onClick={() => setShowWithdrawForm(false)} className="text-xs hover:opacity-80" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
              <button
                onClick={handleSubmitWithdrawal}
                disabled={!Number(amount) || Number(amount) <= 0 || submitting}
                className="rounded-full px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </div>
        )}

        <h3 className="mb-3 text-sm font-semibold" style={{ color: "rgba(245,235,221,0.7)" }}>History</h3>
        {historyLoading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No withdrawal requests yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((w) => {
              const style = STATUS_STYLES[w.status] || STATUS_STYLES.pending;
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>₹{w.amount_rupees}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Requested {formatDate(w.requested_at)}
                      {w.processed_at && ` · Processed ${formatDate(w.processed_at)}`}
                      {w.admin_note && ` · ${w.admin_note}`}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {w.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
          Per-video view counts and content performance analytics aren't available yet — theomy doesn't have real video watch-time tracking. Earnings shown above come from your account balance directly.
        </p>
      </main>
    </div>
  );
}
