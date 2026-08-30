import React, { useEffect, useState } from "react";
import { HandCoins, Check, X, Ban, FileText, QrCode } from "lucide-react";
import {
  fetchAdminDonationRegistrations, approveDonationRegistration, rejectDonationRegistration, disableDonationRegistration,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

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

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);

  const load = () => {
    setLoading(true);
    fetchAdminDonationRegistrations(statusFilter)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

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
    setBusyId(rejectTarget.id);
    setError("");
    try {
      await rejectDonationRegistration(rejectTarget.id, rejectReason.trim() || null);
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't reject this registration.");
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

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
          <HandCoins className="h-5 w-5" style={{ color: COLORS.gold }} /> Donation Registrations
        </h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          Plays Organisers registering their payout details to receive donations.
        </p>
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

                {r.status === "pending" && (
                  <div className="mt-3 flex gap-2">
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
                      onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
                {r.status === "approved" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmDisable(r)}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Ban className="h-3.5 w-3.5" /> Disable
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold" style={{ color: COLORS.cream }}>Reject registration</h3>
            <label className="mb-1 block text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Reason (optional)</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream, resize: "vertical" }}
            />
            <div className="flex gap-2">
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
        message={`Approve "${confirmApprove?.group_name}"? This lets supporters see their payout details as verified.`}
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
    </div>
  );
}
