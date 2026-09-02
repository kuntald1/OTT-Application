import React, { useEffect, useState } from "react";
import { ArrowLeft, IndianRupee, TrendingUp, Wallet, Clock, Film, Video, Eye, Globe2, BarChart3, LayoutList } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { fetchRevenueRate, fetchRevenueSummary, requestWithdrawal, fetchWithdrawalHistory, fetchMyContentPerformance, fetchMyRevenueByDay, fetchMyRevenueByCountry } from "../api";

// ---------------------------------------------------------------------------
// Revenue — Content Creator / Plays Organiser only.
//
// Everything here is now REAL: the per-minute fallback rate, total
// earned / available balance (from creator_earnings, credited live by
// the watch-heartbeat engine — see routers/watch.py), withdrawal
// requests, and per-video content performance (unique viewers, watch
// minutes, gross revenue, and what's actually been credited after
// theomy's commission — see VideoWatchRecord). Revenue for a given
// view is calculated from THAT video's own Revenue-Share Tiers (set at
// upload, up to 5 bands) using a graduated calculation — the same
// shape as a progressive tax bracket — not a flat platform-wide rate;
// the rate box below is only the fallback used for older videos with
// no tiers of their own.
//
// Withdrawal status changes (pending → approved/rejected/paid) are made
// from the admin panel's Revenue Sharing tab.
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: "#D4AF37" },
  approved: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  paid: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

// Fixed palette so a video/country keeps the same slice color across
// re-renders (Object.values order can shift as new data streams in).
const PIE_COLORS = ["#D4AF37", "#6FCF97", "#5B9BD5", "#E07B39", "#B76BD4", "#E0577B", "rgba(245,235,221,0.3)"];

// Simple SVG donut — takes [{ label, value }], draws each slice as an
// arc sized by its share of the total. No charting library needed for
// this many slices (top 5 + "Other").
function PieChart({ data, size = 160 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return null;
  const radius = size / 2;
  const innerRadius = radius * 0.6;
  const center = size / 2;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const slices = data.map((d, i) => {
    const fraction = d.value / total;
    const startAngle = angle;
    const endAngle = angle + fraction * Math.PI * 2;
    angle = endAngle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const ix1 = center + innerRadius * Math.cos(endAngle);
    const iy1 = center + innerRadius * Math.sin(endAngle);
    const ix2 = center + innerRadius * Math.cos(startAngle);
    const iy2 = center + innerRadius * Math.sin(startAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");

    return { path, color: PIE_COLORS[i % PIE_COLORS.length], label: d.label, value: d.value, percent: (fraction * 100).toFixed(1) };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: s.color }} />
            <span style={{ color: COLORS.cream }}>{s.label}</span>
            <span style={{ color: "rgba(245,235,221,0.5)" }}>₹{s.value} · {s.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Collapses a ranked list down to top N + "Other" for a pie chart, so
// a creator with 20 videos doesn't get 20 illegible slices.
function topNPlusOther(rows, labelKey, valueKey, n = 5) {
  const sorted = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  const top = sorted.slice(0, n).map((r) => ({ label: r[labelKey], value: Number(r[valueKey]) }));
  const rest = sorted.slice(n).reduce((sum, r) => sum + Number(r[valueKey]), 0);
  if (rest > 0) top.push({ label: "Other", value: rest });
  return top;
}

export default function RevenuePage({ onBack }) {
  const [pageTab, setPageTab] = useState("graph");
  const [rate, setRate] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [performance, setPerformance] = useState([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  const [revenueByDay, setRevenueByDay] = useState([]);
  const [revenueByCountry, setRevenueByCountry] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const loadAll = (silent = false) => {
    if (!silent) setSummaryLoading(true);
    fetchRevenueSummary().then(setSummary).catch(() => {}).finally(() => setSummaryLoading(false));

    if (!silent) setHistoryLoading(true);
    fetchWithdrawalHistory().then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false));

    fetchMyContentPerformance().then(setPerformance).catch(() => {});
  };

  useEffect(() => {
    fetchRevenueRate().then(setRate).catch(() => setRate(null));
    setPerformanceLoading(true);
    loadAll(false);
    setPerformanceLoading(false);

    setAnalyticsLoading(true);
    Promise.all([fetchMyRevenueByDay(30), fetchMyRevenueByCountry()])
      .then(([byDay, byCountry]) => {
        setRevenueByDay(byDay);
        setRevenueByCountry(byCountry);
      })
      .catch(() => {
        setRevenueByDay([]);
        setRevenueByCountry([]);
      })
      .finally(() => setAnalyticsLoading(false));

    // Total Earned / Available / History / Content Performance are all
    // live server state that changes as videos get watched elsewhere —
    // poll every 20s and refresh on window focus so these numbers don't
    // sit stale until the person manually reloads the page.
    const interval = setInterval(() => loadAll(true), 20000);
    const onFocus = () => loadAll(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
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

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setPageTab("graph")}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={pageTab === "graph" ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Graph
          </button>
          <button
            type="button"
            onClick={() => setPageTab("details")}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={pageTab === "details" ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            <LayoutList className="h-3.5 w-3.5" /> Details
          </button>
        </div>

        {pageTab === "graph" && (
          <div>
            <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
              Built from real watch events, not estimates. "Country" is each viewer's registered account country, not IP-based location.
            </p>

            {analyticsLoading || performanceLoading ? (
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
            ) : (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  Your revenue — last 30 days
                </p>
                {revenueByDay.length === 0 ? (
                  <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events in this window yet.</p>
                ) : (
                  <div className="mb-8 flex items-end gap-1 rounded-xl p-4" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)", height: 160 }}>
                    {(() => {
                      const max = Math.max(...revenueByDay.map((d) => Number(d.creator_earned_rupees)), 0.01);
                      return revenueByDay.map((d) => (
                        <div key={d.date} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }} title={`${d.date}: ₹${d.creator_earned_rupees}`}>
                          <div
                            className="w-full rounded-t"
                            style={{ background: CTA_GRADIENT, height: `${Math.max(4, (Number(d.creator_earned_rupees) / max) * 100)}%` }}
                          />
                        </div>
                      ));
                    })()}
                  </div>
                )}

                <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  Revenue share by video
                </p>
                {performance.length === 0 ? (
                  <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No views tracked yet.</p>
                ) : (
                  <div className="mb-8 rounded-xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <PieChart data={topNPlusOther(performance, "title", "creator_earned_rupees")} />
                  </div>
                )}

                <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  Revenue share by country
                </p>
                {revenueByCountry.length === 0 ? (
                  <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events tracked yet.</p>
                ) : (
                  <div className="rounded-xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <PieChart data={topNPlusOther(revenueByCountry, "country", "creator_earned_rupees")} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {pageTab === "details" && (
          <>
        <div className="mb-6 rounded-2xl p-5" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Platform default rate</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLORS.gold }}>
            {rate ? rate.rate_display : "Loading…"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            This is only a fallback — used for a video that has no custom Revenue-Share Tiers of its own. Any video with its own tiers (set at upload) earns at those rates instead, per minute watched.
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
            {error && <div className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>{error}</div>}
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

        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "rgba(245,235,221,0.7)" }}>
            <Film className="h-4 w-4" style={{ color: COLORS.gold }} /> Top performing content
          </h3>

          {!performanceLoading && performance.length > 0 && (
            <div className="mb-4 flex gap-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
              <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" style={{ color: COLORS.gold }} /> {performance.length} video{performance.length !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" style={{ color: COLORS.gold }} /> {performance.reduce((sum, r) => sum + r.unique_viewers, 0)} total viewers</span>
            </div>
          )}

          {performanceLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : performance.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              No views tracked yet — figures appear here as people watch your uploads, calculated from each video's own Revenue-Share Tiers.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: COLORS.blackSoft }}>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>#</th>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Video</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Viewers</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Watch Minutes</th>
                    <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>You Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((row, i) => (
                    <tr key={row.video_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td className="px-4 py-2.5" style={{ color: "rgba(245,235,221,0.4)" }}>{i + 1}</td>
                      <td className="px-4 py-2.5" style={{ color: COLORS.cream }}>{row.title}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{row.unique_viewers}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{row.total_watch_minutes}</td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: COLORS.gold }}>₹{row.creator_earned_rupees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "rgba(245,235,221,0.7)" }}>
            <TrendingUp className="h-4 w-4" style={{ color: COLORS.gold }} /> Analytics
          </h3>
          <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
            Built from real watch events, not estimates. "Country" is each viewer's registered account country, not IP-based location.
          </p>

          {analyticsLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                Your revenue — last 30 days
              </p>
              {revenueByDay.length === 0 ? (
                <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events in this window yet.</p>
              ) : (
                <div className="mb-6 flex items-end gap-1 rounded-xl p-4" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)", height: 140 }}>
                  {(() => {
                    const max = Math.max(...revenueByDay.map((d) => Number(d.creator_earned_rupees)), 0.01);
                    return revenueByDay.map((d) => (
                      <div key={d.date} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }} title={`${d.date}: ₹${d.creator_earned_rupees}`}>
                        <div
                          className="w-full rounded-t"
                          style={{ background: CTA_GRADIENT, height: `${Math.max(4, (Number(d.creator_earned_rupees) / max) * 100)}%` }}
                        />
                      </div>
                    ));
                  })()}
                </div>
              )}

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                Viewers by country
              </p>
              {revenueByCountry.length === 0 ? (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events tracked yet.</p>
              ) : (
                <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: COLORS.blackSoft }}>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                          <span className="flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" style={{ color: COLORS.gold }} /> Country</span>
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Viewers</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>You Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByCountry.map((row) => (
                        <tr key={row.country} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td className="px-4 py-2.5" style={{ color: COLORS.cream }}>{row.country}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{row.viewer_count}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: COLORS.gold }}>₹{row.creator_earned_rupees}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
