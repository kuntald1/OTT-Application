import React, { useEffect, useState } from "react";
import { HandCoins, Check, X, Ban, FileText, QrCode, Plus, Upload, Trash2 } from "lucide-react";
import {
  fetchAdminDonationRegistrations, createAdminDonationRegistration, approveDonationRegistration,
  rejectDonationRegistration, disableDonationRegistration, deleteAdminDonationRegistration, fetchAdminUsers,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  approved: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  disabled: { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" },
};

export default function AdminDonationRegistrationsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [organisers, setOrganisers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [qrCodeFile, setQrCodeFile] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [creating, setCreating] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    setLoading(true);
    fetchAdminDonationRegistrations(statusFilter)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  useEffect(() => {
    if (!showCreateForm) return;
    fetchAdminUsers()
      .then((users) => setOrganisers((users || []).filter((u) => u.role === "plays_organiser")))
      .catch(() => setOrganisers([]));
  }, [showCreateForm]);

  const resetCreateForm = () => {
    setSelectedUserId(""); setGroupName(""); setAccountNumber(""); setIfscCode("");
    setQrCodeFile(null); setDocumentFile(null);
  };

  const handleCreate = async () => {
    if (!selectedUserId || !groupName.trim() || !documentFile) {
      setError("Please select an organiser, enter a group name, and attach a document.");
      return;
    }
    if (!(accountNumber.trim() && ifscCode.trim()) && !qrCodeFile) {
      setError("Provide either bank details (account number + IFSC) or a QR code.");
      return;
    }
    setError("");
    setCreating(true);
    try {
      await createAdminDonationRegistration({
        userId: selectedUserId, groupName: groupName.trim(), accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim(), qrCodeFile, documentFile,
      });
      resetCreateForm();
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create registration.");
    } finally {
      setCreating(false);
    }
  };

  const handleApproveConfirmed = async () => {
    setBusyId(confirmApprove.id);
    setError("");
    try {
      await approveDonationRegistration(confirmApprove.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't approve this registration.");
    } finally {
      setBusyId(null);
      setConfirmApprove(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setBusyId(rejectTarget.id);
    setRejectError("");
    try {
      await rejectDonationRegistration(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err) {
      setRejectError(err.message || "Couldn't reject this registration.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDisableConfirmed = async () => {
    setBusyId(confirmDisable.id);
    setError("");
    try {
      await disableDonationRegistration(confirmDisable.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't disable this registration.");
    } finally {
      setBusyId(null);
      setConfirmDisable(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    setBusyId(confirmDelete.id);
    setError("");
    try {
      await deleteAdminDonationRegistration(confirmDelete.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete this registration.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
            <HandCoins className="h-5 w-5" style={{ color: COLORS.gold }} /> Donation Registrations
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            Plays Organisers registering their payout details to receive donations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> Add Registration
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {["", "pending", "approved", "rejected", "disabled"].map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatusFilter(s)}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{ background: statusFilter === s ? "rgba(212,175,55,0.15)" : "rgba(245,235,221,0.06)", color: statusFilter === s ? COLORS.gold : "rgba(245,235,221,0.6)" }}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label style={labelStyle}>Plays Organiser *</label>
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={inputStyle}>
                <option value="" style={{ background: COLORS.panel }}>Select…</option>
                {organisers.map((o) => (
                  <option key={o.id} value={o.id} style={{ background: COLORS.panel }}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Group Name *</label>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Account Number</label>
              <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>IFSC Code</label>
              <input type="text" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>QR Code (optional, if no bank details)</label>
              <label
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:opacity-80"
                style={{ borderColor: "rgba(245,235,221,0.15)", color: qrCodeFile ? COLORS.cream : "rgba(245,235,221,0.5)" }}
              >
                <Upload className="h-3.5 w-3.5 flex-shrink-0" />
                {qrCodeFile ? qrCodeFile.name : "Choose image…"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setQrCodeFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div>
              <label style={labelStyle}>Document *</label>
              <label
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:opacity-80"
                style={{ borderColor: "rgba(245,235,221,0.15)", color: documentFile ? COLORS.cream : "rgba(245,235,221,0.5)" }}
              >
                <Upload className="h-3.5 w-3.5 flex-shrink-0" />
                {documentFile ? documentFile.name : "Choose PDF or image…"}
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="mt-3 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: COLORS.gold, color: "#0a0104" }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : requests.length === 0 ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>No registrations found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => {
            const style = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
            return (
              <div key={r.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{r.group_name}</p>
                    <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {r.user_name} · {formatDate(r.created_at)}
                    </p>
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize" style={{ background: style.bg, color: style.color }}>
                    {r.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: "rgba(245,235,221,0.6)" }}>
                  {r.account_number && r.ifsc_code && (
                    <span>A/C: {r.account_number} · IFSC: {r.ifsc_code}</span>
                  )}
                  {r.qr_code_url && (
                    <a href={r.qr_code_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80" style={{ color: COLORS.gold }}>
                      <QrCode className="h-3.5 w-3.5" /> View QR code
                    </a>
                  )}
                  <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80" style={{ color: COLORS.gold }}>
                    <FileText className="h-3.5 w-3.5" /> View document
                  </a>
                </div>
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="mt-2 text-xs" style={{ color: "#f87171" }}>Reason: {r.rejection_reason}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmApprove(r)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97" }}
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRejectTarget(r); setRejectReason(""); setRejectError(""); }}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <button
                      type="button"
                      onClick={() => setConfirmDisable(r)}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Ban className="h-3.5 w-3.5" /> Disable
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(r)}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ background: "rgba(248,113,113,0.08)", color: "#f87171" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold" style={{ color: COLORS.cream }}>Reject registration</h3>
            <label className="mb-1 block text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Reason *</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mb-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream, resize: "vertical" }}
            />
            {rejectError && <p className="mb-3 text-xs" style={{ color: "#f87171" }}>{rejectError}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={busyId === rejectTarget.id}
                className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ background: "#f87171", color: "#1a0505" }}
              >
                {busyId === rejectTarget.id ? "Rejecting…" : "Reject"}
              </button>
              <button type="button" onClick={() => setRejectTarget(null)} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmApprove}
        title="Approve donation registration"
        message={`Approve "${confirmApprove?.group_name}"? This lets supporters see their payout details as verified, and sends them an email + WhatsApp notification.`}
        confirmLabel="Approve"
        busy={busyId === confirmApprove?.id}
        onCancel={() => setConfirmApprove(null)}
        onConfirm={handleApproveConfirmed}
      />

      <ConfirmDialog
        open={!!confirmDisable}
        title="Disable donation registration"
        message={`Disable "${confirmDisable?.group_name}"'s registration? They can still see this decision but won't be treated as approved anymore.`}
        confirmLabel="Disable"
        danger
        busy={busyId === confirmDisable?.id}
        onCancel={() => setConfirmDisable(null)}
        onConfirm={handleDisableConfirmed}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete donation registration"
        message={`Permanently delete "${confirmDelete?.group_name}"'s registration? This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDelete?.id}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
