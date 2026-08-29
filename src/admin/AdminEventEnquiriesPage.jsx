import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { fetchAdminEnquiries, approveEnquiry, rejectEnquiry, deleteEnquiry } from "./adminApi";
import AdminEnquiryEditForm from "./AdminEnquiryEditForm";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const TABS = ["pending", "approved", "rejected", "all"];
const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  approved: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminEventEnquiriesPage() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingId, setEditingId] = useState(null);

  const load = (filter) => {
    setLoading(true);
    fetchAdminEnquiries(filter).then(setEnquiries).catch(() => setEnquiries([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(statusFilter); }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionError("");
    try { await approveEnquiry(id); load(statusFilter); }
    catch (err) { setActionError(err.message || "Couldn't approve this enquiry."); }
  };

  const handleReject = async (id) => {
    if (!rejectNote.trim()) return;
    setActionError("");
    try {
      await rejectEnquiry(id, rejectNote.trim());
      setRejectingId(null); setRejectNote("");
      load(statusFilter);
    } catch (err) { setActionError(err.message || "Couldn't reject this enquiry."); }
  };

  const [confirmDelete, setConfirmDelete] = useState(null); // { id, title }
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    setActionError("");
    try {
      await deleteEnquiry(confirmDelete.id);
      load(statusFilter);
      setConfirmDelete(null);
    } catch (err) {
      setActionError(err.message || "Couldn't delete this enquiry.");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>Event Enquiries</h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Approve, reject, edit, or delete event listing enquiries submitted by Creators and Organisers.</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="rounded-full px-3 py-1 text-xs font-medium capitalize"
            style={{
              background: statusFilter === s ? "rgba(212,175,55,0.14)" : "transparent",
              border: `1px solid ${statusFilter === s ? COLORS.gold : "rgba(245,235,221,0.15)"}`,
              color: statusFilter === s ? COLORS.gold : "rgba(245,235,221,0.6)",
            }}>
            {s}
          </button>
        ))}
      </div>

      {actionError && <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{actionError}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : enquiries.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No {statusFilter !== "all" ? statusFilter : ""} enquiries.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {enquiries.map((e) => {
            const st = STATUS_STYLES[e.status] || STATUS_STYLES.pending;
            return (
              <div key={e.id} className="rounded-xl px-4 py-3" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{e.event_title}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {e.org_name} · {e.event_category} · {formatDate(e.proposed_date)}{e.proposed_time ? ` at ${e.proposed_time}` : ""} · {e.venue}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                      Contact: {e.contact_person} · {e.contact_email} · {e.contact_phone}
                    </p>
                    {e.event_description && <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{e.event_description}</p>}
                    {e.ticket_tiers.length > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                        {e.ticket_tiers.map((t) => `${t.tier_name} ₹${t.price} × ${t.quantity}`).join(" · ")}
                      </p>
                    )}
                    {e.attachments.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.attachments.map((a) => (
                          <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "rgba(212,175,55,0.1)", color: COLORS.gold }}>
                            {a.original_filename}
                          </a>
                        ))}
                      </div>
                    )}
                    {e.admin_note && <p className="mt-1 text-xs" style={{ color: "#f87171" }}>Note: {e.admin_note}</p>}
                  </div>
                  <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, color: st.color }}>{e.status}</span>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <button onClick={() => setEditingId(editingId === e.id ? null : e.id)} className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5" style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.gold }}>
                    {editingId === e.id ? "Close editor" : "Edit"}
                  </button>
                  <button onClick={() => setConfirmDelete({ id: e.id, title: e.event_title })} className="flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5" style={{ borderColor: "#f87171", color: "#f87171" }}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>

                {editingId === e.id && (
                  <AdminEnquiryEditForm
                    enquiry={e}
                    onCancel={() => setEditingId(null)}
                    onFileUpdated={(updated) => setEnquiries((list) => list.map((item) => (item.id === updated.id ? updated : item)))}
                    onSave={(updated) => { setEnquiries((list) => list.map((item) => (item.id === updated.id ? updated : item))); setEditingId(null); }}
                  />
                )}

                {e.status === "pending" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <button onClick={() => handleApprove(e.id)} className="rounded-full px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90" style={{ background: "#6FCF97" }}>
                      Approve
                    </button>
                    {rejectingId === e.id ? (
                      <>
                        <input
                          type="text" autoFocus placeholder="Reason for rejection…" value={rejectNote}
                          onChange={(ev) => setRejectNote(ev.target.value)}
                          onKeyDown={(ev) => ev.key === "Enter" && handleReject(e.id)}
                          className="flex-1 rounded-full border px-3 py-1.5 text-xs outline-none"
                          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                        />
                        <button onClick={() => handleReject(e.id)} disabled={!rejectNote.trim()} className="rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: "#f87171" }}>
                          Confirm
                        </button>
                        <button onClick={() => { setRejectingId(null); setRejectNote(""); }} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setRejectingId(e.id)} className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5" style={{ borderColor: "#f87171", color: "#f87171" }}>
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete enquiry"
        message={`Permanently delete the enquiry for "${confirmDelete?.title}"? This removes it and its attachments completely. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
