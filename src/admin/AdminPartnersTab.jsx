import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchAdminPartners, fetchAdminRevenueByCreator, fetchAdminContentPerformance,
  fetchAdminContentPerformanceBreakdown,
} from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "registered", label: "Registered" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "deactivated", label: "Deactivated" },
];

const CATEGORY_BADGE = {
  registered: { bg: "rgba(91,155,213,0.15)", color: "#5B9BD5" },
  active: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  inactive: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  deactivated: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

// ---------------------------------------------------------------------------
// The "Partner" tab in Reports & Analytics — Plays Organiser accounts,
// filterable by registration/subscription status, each expandable into the
// exact same Revenue Share + Video-wise Revenue breakdown as Revenue
// Sharing Management's "by creator" view (same endpoints, same nested
// viewer/tier drill-down).
// ---------------------------------------------------------------------------

export default function AdminPartnersTab() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedPartnerId, setExpandedPartnerId] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchAdminPartners()
      .then(setPartners)
      .catch((err) => setError(err.message || "Couldn't load partners."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = categoryFilter === "all" ? partners : partners.filter((p) => p.category === categoryFilter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setCategoryFilter(f.id)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={categoryFilter === f.id ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No partners in this category.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <div key={p.user_id} className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(245,235,221,0.1)" }}>
              <button
                type="button"
                onClick={() => setExpandedPartnerId(expandedPartnerId === p.user_id ? null : p.user_id)}
                className="flex w-full items-center justify-between px-4 py-3"
                style={{ background: "rgba(245,235,221,0.03)" }}
              >
                <span className="flex items-center gap-2">
                  {expandedPartnerId === p.user_id ? <ChevronDown className="h-4 w-4" style={{ color: "rgba(245,235,221,0.5)" }} /> : <ChevronRight className="h-4 w-4" style={{ color: "rgba(245,235,221,0.5)" }} />}
                  <span className="text-sm font-semibold" style={{ color: COLORS.cream }}>{p.name}</span>
                  <span className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{p.email}</span>
                </span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={CATEGORY_BADGE[p.category]}>
                  {p.category}
                </span>
              </button>
              {expandedPartnerId === p.user_id && <PartnerRevenueDetail creatorId={p.user_id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerRevenueDetail({ creatorId }) {
  const [creatorRow, setCreatorRow] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [breakdownByVideoId, setBreakdownByVideoId] = useState({});
  const [breakdownLoadingId, setBreakdownLoadingId] = useState(null);
  const [expandedViewerKey, setExpandedViewerKey] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAdminRevenueByCreator(creatorId), fetchAdminContentPerformance(creatorId)])
      .then(([byCreator, performance]) => {
        setCreatorRow(byCreator[0] || null);
        setVideos(performance);
      })
      .catch(() => { setCreatorRow(null); setVideos([]); })
      .finally(() => setLoading(false));
  }, [creatorId]);

  const toggleVideoBreakdown = (videoId) => {
    if (expandedVideoId === videoId) { setExpandedVideoId(null); return; }
    setExpandedVideoId(videoId);
    if (!breakdownByVideoId[videoId]) {
      setBreakdownLoadingId(videoId);
      fetchAdminContentPerformanceBreakdown(videoId)
        .then((rows) => setBreakdownByVideoId((m) => ({ ...m, [videoId]: rows })))
        .catch(() => setBreakdownByVideoId((m) => ({ ...m, [videoId]: [] })))
        .finally(() => setBreakdownLoadingId(null));
    }
  };

  if (loading) return <p className="px-4 py-3 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Loading revenue detail…</p>;

  return (
    <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(245,235,221,0.06)" }}>
      {creatorRow && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Gross", value: creatorRow.gross_revenue_rupees },
            { label: "Platform Share", value: creatorRow.platform_share_rupees },
            { label: "Owner Share", value: creatorRow.creator_share_rupees, accent: true },
            { label: "Paid", value: creatorRow.paid_rupees, color: "#6FCF97" },
            { label: "Pending", value: creatorRow.pending_rupees, color: "#f87171" },
          ].map((c) => (
            <div key={c.label} className="rounded-lg p-2.5" style={{ background: "rgba(0,0,0,0.15)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>{c.label}</p>
              <p className="text-sm font-semibold" style={{ color: c.color || (c.accent ? COLORS.gold : COLORS.cream) }}>₹{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {videos.length === 0 ? (
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>No video revenue yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Video</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Viewers</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Watch Minutes</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Gross Revenue</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Creator Earned</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => {
                const isExpanded = expandedVideoId === v.video_id;
                const viewers = breakdownByVideoId[v.video_id];
                const isLoadingThis = breakdownLoadingId === v.video_id;
                return (
                  <React.Fragment key={v.video_id}>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => toggleVideoBreakdown(v.video_id)}>
                      <td className="px-3 py-2" style={{ color: COLORS.cream }}>
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {v.title}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{v.unique_viewers}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{v.total_watch_minutes}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>₹{v.gross_revenue_rupees}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: COLORS.gold }}>₹{v.creator_earned_rupees}</td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: "rgba(0,0,0,0.15)" }}>
                        <td colSpan={5} className="px-3 py-3 sm:px-6">
                          {isLoadingThis ? (
                            <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
                          ) : !viewers || viewers.length === 0 ? (
                            <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>No viewer data yet.</p>
                          ) : (
                            <div className="overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Viewer</th>
                                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Watch Minutes</th>
                                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.4)" }}>Creator Earned</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {viewers.map((viewer) => {
                                    const viewerKey = `${v.video_id}:${viewer.viewer_label}`;
                                    const viewerExpanded = expandedViewerKey === viewerKey;
                                    return (
                                      <React.Fragment key={viewerKey}>
                                        <tr style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => setExpandedViewerKey(viewerExpanded ? null : viewerKey)}>
                                          <td className="px-2 py-1.5" style={{ color: COLORS.cream }}>
                                            <span className="flex items-center gap-1">
                                              {viewerExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                              {viewer.viewer_label}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1.5 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{viewer.watch_minutes}</td>
                                          <td className="px-2 py-1.5 text-right font-medium" style={{ color: COLORS.gold }}>₹{viewer.creator_earned_rupees}</td>
                                        </tr>
                                        {viewerExpanded && (
                                          <tr style={{ background: "rgba(0,0,0,0.2)" }}>
                                            <td colSpan={3} className="px-2 py-1.5 sm:px-4">
                                              <table className="w-full text-[10px]">
                                                <tbody>
                                                  {viewer.tier_breakdown.map((t, ti) => (
                                                    <tr key={ti} style={{ borderTop: ti === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                                                      <td className="py-1" style={{ color: "rgba(245,235,221,0.7)" }}>{t.range_label} min</td>
                                                      <td className="py-1 text-right" style={{ color: "rgba(245,235,221,0.6)" }}>{t.minutes_in_tier} min</td>
                                                      <td className="py-1 text-right" style={{ color: COLORS.gold }}>₹{t.creator_earned_rupees}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
