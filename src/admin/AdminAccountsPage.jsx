import React, { useEffect, useState } from "react";
import { fetchAdminList, createAdminAccount, deactivateAdminAccount, updateAdminMenuPermissions } from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

// Mirrors AdminLayout.jsx's sidebar — only the entries an ordinary
// admin can ever see (superadmin-exclusive items like Admin Accounts,
// Ad Library, Categories, Subscription Plans aren't assignable here;
// those stay superadmin-only no matter what).
const ASSIGNABLE_MENUS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "reports", label: "Reports & Analytics" },
  { key: "videos", label: "Video Review" },
  { key: "add-video", label: "Add Video" },
  { key: "cast-crew", label: "Cast/Crew Master" },
  { key: "special-categories", label: "Special Categories" },
  { key: "blog", label: "Blog" },
  { key: "community", label: "Community" },
  { key: "donation-registrations", label: "Donation Registrations" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "help-center", label: "Help Center" },
  { key: "page-heroes", label: "Page Heroes" },
  { key: "theater-hero-slides", label: "Ticketing Hero Slides" },
  { key: "archive-hero-slides", label: "Archive Hero Slides" },
  { key: "content-policy", label: "Content & Policy" },
  { key: "ad-banners", label: "Ad Banners" },
  { key: "discovery-settings", label: "Discovery Rows" },
  { key: "enquiries", label: "Event Enquiries" },
  { key: "revenue", label: "Revenue Sharing" },
  { key: "live", label: "Live Streaming" },
  { key: "users", label: "User Management" },
];

export default function AdminAccountsPage({ currentAdmin }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAdmins = () => {
    setLoading(true);
    fetchAdminList()
      .then(setAdmins)
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await createAdminAccount(form);
      setForm({ name: "", email: "", password: "", role: "admin" });
      setShowCreate(false);
      loadAdmins();
    } catch (err) {
      setError(err.message || "Couldn't create admin account.");
    } finally {
      setSubmitting(false);
    }
  };

  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const [managingPermissionsId, setManagingPermissionsId] = useState(null);
  const [permissionsForm, setPermissionsForm] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const startManagePermissions = (admin) => {
    setManagingPermissionsId(admin.id);
    // NULL (unrestricted) starts the checklist fully ticked — matches
    // what that admin can already see today; saving from there only
    // takes effect once boxes are actually unchecked.
    setPermissionsForm(admin.allowed_menu_keys ?? ASSIGNABLE_MENUS.map((m) => m.key));
  };

  const toggleMenuKey = (key) => {
    setPermissionsForm((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  };

  const handleSavePermissions = async (adminId) => {
    setSavingPermissions(true);
    setError("");
    try {
      const updated = await updateAdminMenuPermissions(adminId, permissionsForm);
      setAdmins((list) => list.map((a) => (a.id === adminId ? updated : a)));
      setManagingPermissionsId(null);
    } catch (err) {
      setError(err.message || "Couldn't save permissions.");
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleClearRestriction = async (adminId) => {
    setSavingPermissions(true);
    setError("");
    try {
      const updated = await updateAdminMenuPermissions(adminId, null);
      setAdmins((list) => list.map((a) => (a.id === adminId ? updated : a)));
      setManagingPermissionsId(null);
    } catch (err) {
      setError(err.message || "Couldn't clear the restriction.");
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleDeactivateConfirmed = async () => {
    setDeactivating(true);
    try {
      await deactivateAdminAccount(confirmDeactivateId);
      loadAdmins();
      setConfirmDeactivateId(null);
    } catch (err) {
      setError(err.message || "Couldn't deactivate this account.");
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: COLORS.cream }}>Admin accounts</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Create and manage staff access. Superadmin only.</p>
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setError(""); }}
          className="rounded-full px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
          style={{ background: COLORS.gold }}
        >
          {showCreate ? "Cancel" : "+ New admin account"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-2xl p-5"
          style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.2)" }}
        >
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          {error && <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full px-5 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40"
            style={{ background: COLORS.gold }}
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {admins.map((a) => (
            <div
              key={a.id}
              className="rounded-xl px-4 py-3"
              style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                    {a.name} <span className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}>{a.role}</span>
                    {a.role === "admin" && a.allowed_menu_keys !== null && (
                      <span className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(91,155,213,0.15)", color: "#5B9BD5" }}>
                        Restricted ({a.allowed_menu_keys.length} menu{a.allowed_menu_keys.length === 1 ? "" : "s"})
                      </span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{a.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {a.role === "admin" && (
                    <button
                      onClick={() => (managingPermissionsId === a.id ? setManagingPermissionsId(null) : startManagePermissions(a))}
                      className="text-xs font-medium hover:opacity-80"
                      style={{ color: "#5B9BD5" }}
                    >
                      {managingPermissionsId === a.id ? "Close" : "Manage Permissions"}
                    </button>
                  )}
                  {a.is_active ? (
                    a.id !== currentAdmin.id && (
                      <button
                        onClick={() => setConfirmDeactivateId(a.id)}
                        className="text-xs font-medium hover:opacity-80"
                        style={{ color: "#f87171" }}
                      >
                        Deactivate
                      </button>
                    )
                  ) : (
                    <span className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>Inactive</span>
                  )}
                </div>
              </div>

              {managingPermissionsId === a.id && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p className="mb-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                    Uncheck a menu to hide it from this admin's sidebar. {a.allowed_menu_keys === null && "Currently unrestricted — sees everything below."}
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {ASSIGNABLE_MENUS.map((m) => {
                      const checked = permissionsForm.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleMenuKey(m.key)}
                          className="rounded-full border px-3 py-1 text-xs font-medium"
                          style={checked
                            ? { borderColor: COLORS.gold, background: "rgba(212,175,55,0.14)", color: COLORS.gold }
                            : { borderColor: "rgba(245,235,221,0.15)", background: "transparent", color: "rgba(245,235,221,0.5)" }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSavePermissions(a.id)}
                      disabled={savingPermissions}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
                      style={{ background: COLORS.gold }}
                    >
                      {savingPermissions ? "Saving…" : "Save permissions"}
                    </button>
                    {a.allowed_menu_keys !== null && (
                      <button
                        onClick={() => handleClearRestriction(a.id)}
                        disabled={savingPermissions}
                        className="text-xs font-medium hover:opacity-80 disabled:opacity-40"
                        style={{ color: "rgba(245,235,221,0.5)" }}
                      >
                        Clear restriction (unrestricted access)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeactivateId}
        title="Deactivate admin account"
        message="Deactivate this admin account? They will no longer be able to log in."
        confirmLabel="Deactivate"
        danger
        busy={deactivating}
        onCancel={() => setConfirmDeactivateId(null)}
        onConfirm={handleDeactivateConfirmed}
      />
    </div>
  );
}
