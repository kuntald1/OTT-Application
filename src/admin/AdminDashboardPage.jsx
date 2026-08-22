import React, { useEffect, useState } from "react";
import { fetchAdminList, createAdminAccount, deactivateAdminAccount, setAdminToken } from "./adminApi";

const COLORS = {
  bg: "#0a0104",
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

export default function AdminDashboardPage({ currentAdmin, onLogout }) {
  const isSuperadmin = currentAdmin.role === "superadmin";

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(isSuperadmin);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAdmins = () => {
    if (!isSuperadmin) return;
    setLoading(true);
    fetchAdminList()
      .then(setAdmins)
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleDeactivate = async (adminId) => {
    if (!window.confirm("Deactivate this admin account? They will no longer be able to log in.")) return;
    try {
      await deactivateAdminAccount(adminId);
      loadAdmins();
    } catch (err) {
      alert(err.message || "Couldn't deactivate this account.");
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    onLogout();
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: COLORS.cream }}>theomy Admin</h1>
          <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            {currentAdmin.name} · <span className="capitalize">{currentAdmin.role}</span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-white/5"
          style={{ borderColor: "rgba(245,235,221,0.2)", color: COLORS.cream }}
        >
          Log out
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!isSuperadmin && (
          <div className="rounded-2xl p-6" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              You're signed in as an <b>admin</b>. Day-to-day approval tools (event enquiries, withdrawal requests, and more) will appear here in upcoming phases.
            </p>
          </div>
        )}

        {isSuperadmin && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: COLORS.cream }}>Admin accounts</h2>
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
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                        {a.name} <span className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}>{a.role}</span>
                      </p>
                      <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{a.email}</p>
                    </div>
                    {a.is_active ? (
                      a.id !== currentAdmin.id && (
                        <button
                          onClick={() => handleDeactivate(a.id)}
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
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
