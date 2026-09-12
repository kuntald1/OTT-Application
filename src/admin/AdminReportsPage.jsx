import React, { useEffect, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { fetchAdminReport, downloadAdminReportCsv } from "./adminApi";
import DateRangePicker, { defaultDateRange } from "./DateRangePicker";
import AdminPartnersTab from "./AdminPartnersTab";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const REPORT_TABS = [
  { id: "customers", label: "Customers" },
  { id: "partners", label: "Partner" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "content", label: "Content" },
  { id: "enquiries", label: "Events / Enquiries" },
  { id: "revenue", label: "Revenue" },
];

// Per-report-type presentation — which column groups rows together
// (rendered as a section header instead of a repeated column), which
// columns get a colored status/role badge instead of plain text, and
// which column gets expiry-based traffic-light coloring. All purely
// driven by HEADER NAME, since the backend's report shape is just
// generic {headers, rows} — see admin_reports.py for the exact
// header list per report type.
const REPORT_CONFIG = {
  customers: { groupBy: null, badgeColumns: ["Role", "Status"] },
  subscriptions: { groupBy: "Customer", badgeColumns: ["Status"], expiryColumns: ["Expires"] },
  content: { groupBy: null, badgeColumns: ["Status"] },
  enquiries: { groupBy: "Organisation", badgeColumns: ["Status"] },
  revenue: { groupBy: "Customer", badgeColumns: [] },
};

const ROLE_BADGE = {
  user: { bg: "rgba(91,155,213,0.15)", color: "#5B9BD5" },
  content_creator: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  plays_organiser: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
};

// Generic status-word → color mapping, covers every status-like value
// across all 5 reports (Active/Deactivated, Active/Inactive, and the
// raw enum values for videos/enquiries: pending/published/scheduled/
// disabled/rejected/approved) without needing a separate map per
// report type.
function statusBadgeStyle(value) {
  const v = String(value).toLowerCase();
  if (["active", "published", "approved", "paid"].includes(v)) return { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" };
  if (["pending", "scheduled"].includes(v)) return { bg: "rgba(212,175,55,0.15)", color: COLORS.gold };
  if (["inactive", "deactivated", "expired", "rejected", "disabled", "failed"].includes(v)) return { bg: "rgba(248,113,113,0.15)", color: "#f87171" };
  return { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.6)" };
}

function Badge({ header, value }) {
  const style = header === "Role"
    ? (ROLE_BADGE[String(value).toLowerCase()] || { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.6)" })
    : statusBadgeStyle(value);
  const label = header === "Role" ? String(value).replace(/_/g, " ") : value;
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={style}>
      {label}
    </span>
  );
}

// Traffic-light coloring for a date-string cell (YYYY-MM-DD, from
// admin_reports.py's strftime formatting) — already past = red,
// still within the current calendar month = amber, later = green.
function expiryColor(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "rgba(245,235,221,0.6)";
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  if (date < now) return "#f87171"; // already expired
  if (date <= endOfMonth) return "#D4AF37"; // expiring this month
  return "#6FCF97"; // later
}

export default function AdminReportsPage({ initialTab }) {
  const [tab, setTab] = useState(initialTab || "customers");
  const [dateRange, setDateRange] = useState(defaultDateRange());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (tab === "partners") return;
    setLoading(true);
    setError("");
    fetchAdminReport(tab, dateRange)
      .then(setReport)
      .catch((err) => setError(err.message || "Couldn't load this report."))
      .finally(() => setLoading(false));
  }, [tab, dateRange]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAdminReportCsv(tab, dateRange);
    } catch (err) {
      setError(err.message || "Couldn't export the report.");
    } finally {
      setExporting(false);
    }
  };

  const config = REPORT_CONFIG[tab] || {};
  const groupByIndex = config.groupBy && report ? report.headers.indexOf(config.groupBy) : -1;

  // Rows in their original (backend-sorted) order, bucketed under
  // each distinct group-column value the first time it's seen — never
  // re-sorted, so "top earners first" / "most recent first" ordering
  // from the backend survives within each group.
  let groupedRows = null;
  if (groupByIndex >= 0 && report) {
    const order = [];
    const buckets = {};
    for (const row of report.rows) {
      const key = row[groupByIndex];
      if (!buckets[key]) { buckets[key] = []; order.push(key); }
      buckets[key].push(row);
    }
    groupedRows = order.map((key) => ({ key, rows: buckets[key] }));
  }

  const renderCell = (header, value) => {
    if (config.badgeColumns?.includes(header)) return <Badge header={header} value={value} />;
    if (config.expiryColumns?.includes(header)) return <span style={{ color: expiryColor(value) }}>{String(value)}</span>;
    return String(value);
  };

  const renderRow = (row, i) => (
    <tr key={i} style={{ borderTop: "1px solid rgba(245,235,221,0.06)" }}>
      {row.map((cell, j) => (
        <td key={j} className="px-3 py-2 align-top" style={{ color: COLORS.cream }}>
          {renderCell(report.headers[j], cell)}
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <BarChart3 className="h-6 w-6" style={{ color: COLORS.gold }} /> Reports and Analytics
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Basic reports covering customers, subscriptions, events, content, enquiries, and revenue — export any of these as CSV.
      </p>

      <div className="mb-4">
        {tab !== "partners" && <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={setDateRange} />}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((t) => (
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
        {tab !== "partners" && (
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
          >
            <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {tab === "partners" ? (
        <AdminPartnersTab />
      ) : loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : !report || report.rows.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No data for this report.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(245,235,221,0.1)" }}>
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr style={{ background: "rgba(245,235,221,0.05)" }}>
                {report.headers.map((h, i) => (
                  // The group-by column itself is shown as each
                  // group's section header instead — no need for its
                  // own repeated column too.
                  i === groupByIndex ? null : (
                    <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {h}
                    </th>
                  )
                ))}
              </tr>
            </thead>
            {groupedRows ? (
              groupedRows.map((group) => (
                <tbody key={group.key}>
                  <tr>
                    <td colSpan={report.headers.length - 1} className="px-3 pb-1.5 pt-4" style={{ color: COLORS.gold, fontWeight: 600, fontSize: 13 }}>
                      {group.key} <span className="ml-1 font-normal" style={{ color: "rgba(245,235,221,0.4)" }}>({group.rows.length})</span>
                    </td>
                  </tr>
                  {group.rows.map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(245,235,221,0.06)" }}>
                      {row.map((cell, j) => (
                        j === groupByIndex ? null : (
                          <td key={j} className="px-3 py-2 align-top" style={{ color: COLORS.cream }}>
                            {renderCell(report.headers[j], cell)}
                          </td>
                        )
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))
            ) : (
              <tbody>{report.rows.map(renderRow)}</tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
