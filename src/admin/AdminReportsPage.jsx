import React, { useEffect, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { fetchAdminReport, downloadAdminReportCsv } from "./adminApi";
import DateRangePicker, { defaultDateRange } from "./DateRangePicker";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const REPORT_TABS = [
  { id: "customers", label: "Customers" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "content", label: "Content" },
  { id: "enquiries", label: "Events / Enquiries" },
  { id: "transactions", label: "Transactions" },
  { id: "revenue", label: "Revenue" },
];

export default function AdminReportsPage() {
  const [tab, setTab] = useState("customers");
  const [dateRange, setDateRange] = useState(defaultDateRange());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
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

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <BarChart3 className="h-6 w-6" style={{ color: COLORS.gold }} /> Reports and Analytics
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Basic reports covering customers, subscriptions, events, content, enquiries, transactions and revenue — export any of these as CSV.
      </p>

      <div className="mb-4">
        <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={setDateRange} />
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
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
        >
          <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : !report || report.rows.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No data for this report.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(245,235,221,0.1)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ background: "rgba(245,235,221,0.05)" }}>
                {report.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(245,235,221,0.06)" }}>
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-2" style={{ color: COLORS.cream }}>
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
