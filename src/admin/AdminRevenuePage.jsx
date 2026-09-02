import React, { useEffect, useState } from "react";
import { Wallet, BarChart3, Check, X, Banknote, Globe2, Settings, TrendingUp, IndianRupee, Users, Film as FilmIcon, Award, Sparkles } from "lucide-react";
import {
  fetchAdminWithdrawals, approveWithdrawal, markWithdrawalPaid, rejectWithdrawal,
  fetchAdminContentPerformance, fetchAdminRevenueConfig, updateAdminRevenueConfig,
  fetchAIConfig, updateAIConfig,
  fetchRevenueByDay, fetchRevenueByCountry, fetchAdminRevenueSummary, fetchAdminRevenueByCreator,
  fetchAnalyticsInsights,
} from "./adminApi";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

const CTA_GRADIENT = "linear-gradient(135deg, #D4AF37, #b8912c)";
const CTA_TEXT_COLOR = "#0a0104";

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_STYLES = {
  pending: { bg: "rgba(255,255,255,0.08)", color: "rgba(245,235,221,0.6)" },
  approved: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  paid: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminRevenuePage({ currentAdmin }) {
  const isSuperadmin = currentAdmin?.role === "superadmin";
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

  const [summary, setSummary] = useState(null);
  const [byCreator, setByCreator] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [revenueByDay, setRevenueByDay] = useState([]);
  const [revenueByCountry, setRevenueByCountry] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsMeta, setInsightsMeta] = useState(null);

  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configForm, setConfigForm] = useState({ ratePaisa: "", commissionPercent: "" });
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configSaved, setConfigSaved] = useState(false);

  const [aiConfigLoading, setAiConfigLoading] = useState(true);
  const [aiConfigForm, setAiConfigForm] = useState({ insightCacheHours: "" });
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [aiConfigError, setAiConfigError] = useState("");
  const [aiConfigSaved, setAiConfigSaved] = useState(false);

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

    setSummaryLoading(true);
    Promise.all([fetchAdminRevenueSummary(), fetchAdminRevenueByCreator()])
      .then(([s, c]) => {
        setSummary(s);
        setByCreator(c);
      })
      .catch(() => {
        setSummary(null);
        setByCreator([]);
      })
      .finally(() => setSummaryLoading(false));
  }, [tab]);

  const loadInsights = (force = false) => {
    setInsightsLoading(true);
    fetchAnalyticsInsights(force)
      .then((res) => {
        setInsights(res.insights);
        setInsightsMeta({ generatedAt: res.generated_at, cached: res.cached });
      })
      .catch(() => setInsights(""))
      .finally(() => setInsightsLoading(false));
  };

  useEffect(() => {
    if (tab !== "analytics") return;
    setAnalyticsLoading(true);
    Promise.all([fetchRevenueByDay(30), fetchRevenueByCountry()])
      .then(([byDay, byCountry]) => {
        setRevenueByDay(byDay);
        setRevenueByCountry(byCountry);
      })
      .catch(() => {
        setRevenueByDay([]);
        setRevenueByCountry([]);
      })
      .finally(() => setAnalyticsLoading(false));

    loadInsights(false);
  }, [tab]);

  useEffect(() => {
    if (tab !== "settings" || !isSuperadmin) return;
    setConfigLoading(true);
    fetchAdminRevenueConfig()
      .then((c) => {
        setConfig(c);
        setConfigForm({ ratePaisa: String(c.rate_paisa_per_minute), commissionPercent: String(c.platform_commission_percent) });
      })
      .catch(() => setConfig(null))
      .finally(() => setConfigLoading(false));

    setAiConfigLoading(true);
    fetchAIConfig()
      .then((c) => setAiConfigForm({ insightCacheHours: String(c.insight_cache_hours) }))
      .catch(() => {})
      .finally(() => setAiConfigLoading(false));
  }, [tab, isSuperadmin]);

  const handleSaveConfig = async () => {
    setConfigError("");
    setConfigSaved(false);
    const rate = Number(configForm.ratePaisa);
    const commission = Number(configForm.commissionPercent);
    if (!rate || rate <= 0) {
      setConfigError("Rate must be a positive number (in paisa/min).");
      return;
    }
    if (commission < 0 || commission > 100) {
      setConfigError("Commission must be between 0 and 100.");
      return;
    }
    setConfigSaving(true);
    try {
      const updated = await updateAdminRevenueConfig({ ratePaisaPerMinute: rate, platformCommissionPercent: commission });
      setConfig(updated);
      setConfigSaved(true);
    } catch (err) {
      setConfigError(err.message || "Couldn't save. Please try again.");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSaveAIConfig = async () => {
    setAiConfigError("");
    setAiConfigSaved(false);
    const hours = Number(aiConfigForm.insightCacheHours);
    if (!hours || hours < 1 || hours > 168) {
      setAiConfigError("Must be between 1 and 168 hours.");
      return;
    }
    setAiConfigSaving(true);
    try {
      await updateAIConfig(hours);
      setAiConfigSaved(true);
    } catch (err) {
      setAiConfigError(err.message || "Couldn't save. Please try again.");
    } finally {
      setAiConfigSaving(false);
    }
  };

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
        <button
          type="button"
          onClick={() => setTab("analytics")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{
            background: tab === "analytics" ? "rgba(212,175,55,0.12)" : "transparent",
            color: tab === "analytics" ? COLORS.gold : "rgba(245,235,221,0.6)",
          }}
        >
          <Globe2 className="h-4 w-4" /> Analytics
        </button>
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setTab("settings")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: tab === "settings" ? "rgba(212,175,55,0.12)" : "transparent",
              color: tab === "settings" ? COLORS.gold : "rgba(245,235,221,0.6)",
            }}
          >
            <Settings className="h-4 w-4" /> Platform Settings
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {tab === "withdrawals" && (
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
      )}

      {tab === "performance" && (
        <div>
          {summaryLoading ? (
            <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading summary…</p>
          ) : summary && (
            <>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.cream }}>
                <TrendingUp className="h-4 w-4" style={{ color: COLORS.gold }} /> Revenue Summary
              </h3>
              <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { icon: IndianRupee, label: "Gross Revenue", value: `₹${summary.gross_revenue_rupees}` },
                  { icon: Wallet, label: "Platform Share", value: `₹${summary.platform_share_rupees}` },
                  { icon: Users, label: "Creator Share", value: `₹${summary.creator_share_rupees}` },
                  { icon: FilmIcon, label: "Published Videos", value: summary.total_published_videos },
                  { icon: BarChart3, label: "Viewer Records", value: summary.total_viewer_records },
                  { icon: TrendingUp, label: "Avg / 1000 min", value: `₹${summary.avg_revenue_per_1000_minutes_rupees}` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl p-4" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Icon className="mb-2 h-4 w-4" style={{ color: "rgba(212,175,55,0.6)" }} />
                    <p className="text-lg font-semibold" style={{ color: COLORS.cream }}>{value}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
                  </div>
                ))}
              </div>

              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.cream }}>
                <Award className="h-4 w-4" style={{ color: COLORS.gold }} /> Revenue Share Report — by creator
              </h3>
              {byCreator.length === 0 ? (
                <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No creator revenue yet.</p>
              ) : (
                <div className="mb-8 overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: COLORS.panel }}>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Creator</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Gross</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Platform Share</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Owner Share</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Paid</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCreator.map((row) => (
                        <tr key={row.creator_user_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td className="px-4 py-2.5" style={{ color: COLORS.cream }}>
                            {row.creator_name}
                            <span className="ml-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{row.creator_email}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>₹{row.gross_revenue_rupees}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>₹{row.platform_share_rupees}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: COLORS.gold }}>₹{row.creator_share_rupees}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: "#6FCF97" }}>₹{row.paid_rupees}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: row.pending_rupees > 0 ? "#f87171" : "rgba(245,235,221,0.5)" }}>₹{row.pending_rupees}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.cream }}>
            <FilmIcon className="h-4 w-4" style={{ color: COLORS.gold }} /> Video-wise Revenue — top earners first
          </h3>
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

      {tab === "analytics" && (
        <div>
          <div className="mb-6 rounded-xl p-4" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)" }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.gold }}>
                <Sparkles className="h-4 w-4" /> AI Insights
              </h3>
              <button
                type="button"
                onClick={() => loadInsights(true)}
                disabled={insightsLoading}
                className="text-xs font-medium underline disabled:opacity-50"
                style={{ color: "rgba(212,175,55,0.7)" }}
              >
                Regenerate
              </button>
            </div>
            {insightsLoading ? (
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Analyzing performance…</p>
            ) : insights ? (
              <>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.85)" }}>{insights}</p>
                {insightsMeta?.generatedAt && (
                  <p className="mt-2 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                    {insightsMeta.cached ? "Cached — " : "Freshly generated — "}
                    {new Date(insightsMeta.generatedAt).toLocaleString("en-IN")}
                    {insightsMeta.cached && " (regenerates automatically every 6 hours, or click Regenerate to force it now)"}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                No insights available — check that ANTHROPIC_API_KEY is configured on the server.
              </p>
            )}
          </div>

          <p className="mb-5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
            Built from real crediting events (RevenueLedgerEntry) — not estimates. "Country" is each viewer's registered
            account country, not IP-based geolocation (theomy doesn't track that). Device, traffic-source, and
            watch-retention breakdowns aren't available — those would need tracking that doesn't exist yet.
          </p>

          {analyticsLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : (
            <>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.cream }}>
                <TrendingUp className="h-4 w-4" style={{ color: COLORS.gold }} /> Revenue — last 30 days
              </h3>
              {revenueByDay.length === 0 ? (
                <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events in this window yet.</p>
              ) : (
                <div className="mb-8 flex items-end gap-1 rounded-xl p-4" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)", height: 160 }}>
                  {(() => {
                    const max = Math.max(...revenueByDay.map((d) => Number(d.creator_earned_rupees)), 0.01);
                    return revenueByDay.map((d) => (
                      <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                        <div
                          className="w-full rounded-t transition-opacity group-hover:opacity-80"
                          style={{
                            background: CTA_GRADIENT,
                            height: `${Math.max(4, (Number(d.creator_earned_rupees) / max) * 100)}%`,
                          }}
                          title={`${d.date}: ₹${d.creator_earned_rupees}`}
                        />
                      </div>
                    ));
                  })()}
                </div>
              )}

              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.cream }}>
                <Globe2 className="h-4 w-4" style={{ color: COLORS.gold }} /> Viewers by country
              </h3>
              {revenueByCountry.length === 0 ? (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No revenue events tracked yet.</p>
              ) : (
                <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: COLORS.panel }}>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Country</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Viewers</th>
                        <th className="px-4 py-2.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Creator Earned</th>
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
      )}

      {tab === "settings" && isSuperadmin && (
        <div className="max-w-sm">
          <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.cream }}>Platform default rate</h3>
          <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            Only applies to a video with no custom Revenue-Share Tiers of its own — a video with tiers always uses those instead.
          </p>

          {configLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : !config ? (
            <p className="text-sm" style={{ color: "#f87171" }}>Couldn't load config.</p>
          ) : (
            <div className="rounded-xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                Rate (paisa per minute)
              </label>
              <input
                type="number"
                min="0"
                value={configForm.ratePaisa}
                onChange={(e) => setConfigForm((f) => ({ ...f, ratePaisa: e.target.value }))}
                className="mb-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />

              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                Platform commission (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={configForm.commissionPercent}
                onChange={(e) => setConfigForm((f) => ({ ...f, commissionPercent: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />
              <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                Taken from every credited view before the creator's share — e.g. 20 means creators keep 80%.
              </p>

              {configError && <p className="mt-3 text-xs font-medium" style={{ color: "#f87171" }}>{configError}</p>}
              {configSaved && !configError && <p className="mt-3 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                {configSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}

          <h3 className="mb-1 mt-8 text-sm font-semibold" style={{ color: COLORS.cream }}>AI Insights cache duration</h3>
          <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            How long a generated insight stays cached before the Analytics tab triggers a fresh (paid) Claude call again.
          </p>

          {aiConfigLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : (
            <div className="rounded-xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                Cache duration (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={aiConfigForm.insightCacheHours}
                onChange={(e) => setAiConfigForm({ insightCacheHours: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />
              <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                1 to 168 hours (1 week). Lower = fresher insights, more API cost. Higher = cheaper, staler.
              </p>

              {aiConfigError && <p className="mt-3 text-xs font-medium" style={{ color: "#f87171" }}>{aiConfigError}</p>}
              {aiConfigSaved && !aiConfigError && <p className="mt-3 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}

              <button
                type="button"
                onClick={handleSaveAIConfig}
                disabled={aiConfigSaving}
                className="mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                {aiConfigSaving ? "Saving…" : "Save changes"}
              </button>
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
