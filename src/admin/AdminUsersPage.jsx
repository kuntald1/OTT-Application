import React, { useEffect, useState } from "react";
import { Users, Search, Key, Video, UserX, UserCheck, X, Send, CornerDownRight, Eye } from "lucide-react";
import { fetchAdminUsers, setUserPassword, setUserLiveStreaming, setUserActive, notifyUserLiveStreaming, fetchAdminUserSubscriptions, fetchAdminUserPayments } from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";
import AdminOrganiserRequestsTab from "./AdminOrganiserRequestsTab";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

// Distinct color per role so the account list is scannable at a
// glance — User (neutral gray), Content Creator (gold, matches the
// site's accent), Plays Organiser (blue, visually distinct from gold).
const ROLE_STYLES = {
  user: { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" },
  content_creator: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  plays_organiser: { bg: "rgba(96,165,250,0.15)", color: "#60a5fa" },
};
const ROLE_LABELS = { user: "User", content_creator: "Content Creator", plays_organiser: "Plays Organiser" };

export default function AdminUsersPage({ currentAdmin }) {
  const isSuperadmin = currentAdmin?.role === "superadmin";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [passwordDialogUser, setPasswordDialogUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const load = (searchTerm) => {
    setLoading(true);
    fetchAdminUsers(searchTerm)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(""), []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(search);
  };

  const handleToggleLiveStreaming = async (user) => {
    setBusyId(user.id);
    setError("");
    try {
      await setUserLiveStreaming(user.id, !user.can_live_stream);
      load(search);
    } catch (err) {
      setError(err.message || "Couldn't update live streaming permission.");
    } finally {
      setBusyId(null);
    }
  };

  const [notifiedId, setNotifiedId] = useState(null);

  const handleNotify = async (user) => {
    setBusyId(user.id);
    setError("");
    try {
      await notifyUserLiveStreaming(user.id);
      setNotifiedId(user.id);
      setTimeout(() => setNotifiedId((id) => (id === user.id ? null : id)), 3000);
    } catch (err) {
      setError(err.message || "Couldn't send notification.");
    } finally {
      setBusyId(null);
    }
  };

  const [confirmToggleUser, setConfirmToggleUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);

  const handleToggleActiveConfirmed = async () => {
    const user = confirmToggleUser;
    const action = user.is_active ? "deactivate" : "reactivate";
    setBusyId(user.id);
    setError("");
    try {
      await setUserActive(user.id, !user.is_active);
      load(search);
    } catch (err) {
      setError(err.message || `Couldn't ${action} account.`);
    } finally {
      setBusyId(null);
      setConfirmToggleUser(null);
    }
  };

  const openPasswordDialog = (user) => {
    setPasswordDialogUser(user);
    setNewPassword("");
    setPasswordError("");
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setBusyId(passwordDialogUser.id);
    try {
      await setUserPassword(passwordDialogUser.id, newPassword);
      setPasswordDialogUser(null);
    } catch (err) {
      setPasswordError(err.message || "Couldn't set password.");
    } finally {
      setBusyId(null);
    }
  };

  const [tab, setTab] = useState("users");

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold" style={{ color: COLORS.cream }}>
        <Users className="h-5 w-5" style={{ color: COLORS.gold }} /> User Management
      </h2>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Regular platform accounts (User / Content Creator / Plays Organiser) — separate from Admin Accounts.
      </p>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("users")}
          className="rounded-full px-4 py-1.5 text-xs font-semibold"
          style={{ background: tab === "users" ? COLORS.gold : "rgba(245,235,221,0.06)", color: tab === "users" ? "#0a0104" : "rgba(245,235,221,0.7)" }}
        >
          Users
        </button>
        <button
          type="button"
          onClick={() => setTab("requests")}
          className="rounded-full px-4 py-1.5 text-xs font-semibold"
          style={{ background: tab === "requests" ? COLORS.gold : "rgba(245,235,221,0.06)", color: tab === "requests" ? "#0a0104" : "rgba(245,235,221,0.7)" }}
        >
          Organiser Requests
        </button>
      </div>

      {tab === "requests" ? (
        <AdminOrganiserRequestsTab />
      ) : (
        <>
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}
        >
          <Search className="h-4 w-4" /> Search
        </button>
      </form>

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No users found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
              style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)", opacity: u.is_active ? 1 : 0.5 }}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.cream }}>
                  {u.name}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={ROLE_STYLES[u.role] || ROLE_STYLES.user}
                  >
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  {!u.is_active && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>
                      Deactivated
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{u.email}</p>
                {u.parent_id && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}>
                    <CornerDownRight className="h-3 w-3" /> Sub-account of {u.parent_name} ({u.parent_email})
                  </p>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingUser(u)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
                {isSuperadmin && (
                  <button
                    type="button"
                    onClick={() => openPasswordDialog(u)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                  >
                    <Key className="h-3.5 w-3.5" /> Password
                  </button>
                )}
                {(u.role === "content_creator" || u.role === "plays_organiser") && (
                  <button
                    type="button"
                    onClick={() => handleToggleLiveStreaming(u)}
                    disabled={busyId === u.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{
                      background: u.can_live_stream ? "rgba(111,207,151,0.15)" : "rgba(245,235,221,0.06)",
                      color: u.can_live_stream ? "#6FCF97" : "rgba(245,235,221,0.7)",
                    }}
                  >
                    <Video className="h-3.5 w-3.5" /> {u.can_live_stream ? "Live: On" : "Live: Off"}
                  </button>
                )}
                {(u.role === "content_creator" || u.role === "plays_organiser") && u.can_live_stream && (
                  <button
                    type="button"
                    onClick={() => handleNotify(u)}
                    disabled={busyId === u.id}
                    title="Email + WhatsApp them about broadcasting"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{
                      background: notifiedId === u.id ? "rgba(111,207,151,0.15)" : "rgba(212,175,55,0.12)",
                      color: notifiedId === u.id ? "#6FCF97" : COLORS.gold,
                    }}
                  >
                    <Send className="h-3.5 w-3.5" /> {notifiedId === u.id ? "Sent!" : "Notify"}
                  </button>
                )}
                {isSuperadmin && (
                  <button
                    type="button"
                    onClick={() => setConfirmToggleUser(u)}
                    disabled={busyId === u.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{
                      background: u.is_active ? "rgba(248,113,113,0.12)" : "rgba(111,207,151,0.15)",
                      color: u.is_active ? "#f87171" : "#6FCF97",
                    }}
                  >
                    {u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {passwordDialogUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setPasswordDialogUser(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>Set new password</h3>
              <button type="button" onClick={() => setPasswordDialogUser(null)} style={{ color: "rgba(245,235,221,0.5)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{passwordDialogUser.name} — {passwordDialogUser.email}</p>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            {passwordError && <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{passwordError}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setPasswordDialogUser(null)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.6)" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={busyId === passwordDialogUser.id}
                className="rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#0a0104" }}
              >
                {busyId === passwordDialogUser.id ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmToggleUser}
        title={confirmToggleUser?.is_active ? "Deactivate account" : "Reactivate account"}
        message={`${confirmToggleUser?.is_active ? "Deactivate" : "Reactivate"} ${confirmToggleUser?.name}'s account?`}
        confirmLabel={confirmToggleUser?.is_active ? "Deactivate" : "Reactivate"}
        danger={confirmToggleUser?.is_active}
        busy={busyId === confirmToggleUser?.id}
        onCancel={() => setConfirmToggleUser(null)}
        onConfirm={handleToggleActiveConfirmed}
      />

      {viewingUser && (
        <CustomerDetailModal user={viewingUser} onClose={() => setViewingUser(null)} />
      )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------- Customer detail
// "Customer Management" drill-down — account status (already visible on
// the row itself), subscription history, and payment history for one
// customer. Opened via the "View" button on each row above.

function CustomerDetailModal({ user, onClose }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchAdminUserSubscriptions(user.id), fetchAdminUserPayments(user.id)])
      .then(([subs, pays]) => {
        setSubscriptions(subs);
        setPayments(pays);
      })
      .catch((err) => setError(err.message || "Couldn't load customer details."))
      .finally(() => setLoading(false));
  }, [user.id]);

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>{user.name}</h3>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{user.email}</p>
          </div>
          <button type="button" onClick={onClose} style={{ color: "rgba(245,235,221,0.5)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs" style={{ color: user.is_active ? "#6FCF97" : "#f87171" }}>
          {user.is_active ? "Active account" : "Deactivated account"}
        </p>

        {loading ? (
          <p className="mt-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : error ? (
          <p className="mt-6 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
        ) : (
          <>
            <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Subscriptions</h4>
            {subscriptions.length === 0 ? (
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.4)" }}>No subscriptions.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {subscriptions.map((s) => (
                  <div key={s.id} className="rounded-lg p-3 text-sm" style={{ background: "rgba(245,235,221,0.03)" }}>
                    <p style={{ color: COLORS.cream }}>
                      {s.plan_name} — {s.duration_label} · {s.screens} screen{s.screens === 1 ? "" : "s"}
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={s.is_active ? { background: "rgba(111,207,151,0.15)", color: "#6FCF97" } : { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" }}>
                        {s.is_active ? "Active" : "Past"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {s.currency} {s.price} · {formatDate(s.started_at)} → {formatDate(s.expires_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Payment History</h4>
            {payments.length === 0 ? (
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.4)" }}>No payments.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-lg p-3 text-sm" style={{ background: "rgba(245,235,221,0.03)" }}>
                    <p style={{ color: COLORS.cream }}>
                      {p.plan_name} — {p.duration_label} · {p.currency} {p.total_amount}
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={
                          p.status === "paid" ? { background: "rgba(111,207,151,0.15)", color: "#6FCF97" }
                          : p.status === "failed" ? { background: "rgba(248,113,113,0.15)", color: "#f87171" }
                          : { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" }
                        }
                      >
                        {p.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {p.gateway} · {formatDate(p.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
