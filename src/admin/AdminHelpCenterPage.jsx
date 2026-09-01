import React, { useEffect, useState } from "react";
import { LifeBuoy, MessageSquare, FileWarning } from "lucide-react";
import { fetchAdminTickets, updateAdminTicketStatus } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const SOURCE_TABS = [
  { id: "", label: "All" },
  { id: "message", label: "Messages" },
  { id: "complaint", label: "Complaints" },
];

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"];

const STATUS_STYLE = {
  Open: { background: "rgba(212,175,55,0.12)", color: COLORS.gold },
  "In Progress": { background: "rgba(91,155,213,0.15)", color: "#5B9BD5" },
  Resolved: { background: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  Closed: { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" },
};

export default function AdminHelpCenterPage() {
  const [sourceTab, setSourceTab] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminTickets({ source: sourceTab || undefined })
      .then(setTickets)
      .catch((err) => setError(err.message || "Couldn't load tickets."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [sourceTab]);

  const handleStatusChange = async (ticketId, newStatus) => {
    setBusyId(ticketId);
    try {
      await updateAdminTicketStatus(ticketId, newStatus);
      setTickets((list) => list.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
    } catch (err) {
      setError(err.message || "Couldn't update status.");
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <LifeBuoy className="h-6 w-6" style={{ color: COLORS.gold }} /> Help Center
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Messages and complaints submitted from the site's Help Center — both land here as tickets.
      </p>

      <div className="mb-6 flex gap-2">
        {SOURCE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSourceTab(t.id)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={sourceTab === t.id ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No tickets found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.cream }}>
                    {t.source === "message" ? <MessageSquare className="h-3.5 w-3.5" style={{ color: COLORS.gold }} /> : <FileWarning className="h-3.5 w-3.5" style={{ color: COLORS.gold }} />}
                    {t.subject}
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.5)" }}>
                      {t.ticket_number}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{t.customer_name} · {t.customer_email}</p>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => handleStatusChange(t.id, e.target.value)}
                  disabled={busyId === t.id}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold outline-none disabled:opacity-50"
                  style={{ ...(STATUS_STYLE[t.status] || {}), border: "none", colorScheme: "dark" }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} style={{ background: COLORS.panel, color: COLORS.cream }}>{s}</option>
                  ))}
                </select>
              </div>
              {t.description && (
                <p className="mt-2 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>{t.description}</p>
              )}
              {t.image_url && (
                <a href={t.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                  <img
                    src={t.image_url}
                    alt="Attached screenshot"
                    className="h-24 w-24 rounded-lg object-cover transition-opacity hover:opacity-80"
                    style={{ border: "1px solid rgba(245,235,221,0.15)" }}
                  />
                </a>
              )}
              <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.35)" }}>Filed {formatDate(t.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
