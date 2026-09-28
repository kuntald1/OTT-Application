import React, { useEffect, useState } from "react";
import { fetchRolePermissions, updateRolePermissions } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

// ---------------------------------------------------------------------------
// Role permissions — which admin menus EVERY account of a role sees (Admin
// decision, Sept 2026: role-based, not per account). Today only the Plays
// Organiser role, whose accounts are made from User Management > Create
// organiser > "Give access to Admin Portal". Ordinary admin accounts keep
// their own per-account "Manage Permissions" below, unchanged.
//
// Only menus registered for the role are offered (the server enforces the
// same list): the powerful staff menus can't be granted to an organiser.
// Enabling a menu here doesn't by itself open anything until that menu's
// page and API exist — the organiser sees only pages that are built.
// ---------------------------------------------------------------------------

export default function RolePermissionsPanel({ role = "plays_organiser" }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRolePermissions(role)
      .then((d) => { setData(d); setSelected(d.menu_keys); })
      .catch((e) => setLoadError(e.message || "Couldn't load role permissions."));
  }, [role]);

  const toggle = (key) => {
    setSaved(false);
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateRolePermissions(role, selected);
      setData(updated);
      setSelected(updated.menu_keys);
      setSaved(true);
    } catch (e) {
      setError(e.message || "Couldn't save role permissions.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <p className="mb-6 text-sm" style={{ color: "#f87171" }}>{loadError}</p>;
  if (!data) return null;

  return (
    <div className="mb-6 rounded-xl px-4 py-4" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>Role permissions — {data.role_label}</p>
      <p className="mb-3 mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
        Applies to every {data.role_label} account that has Admin Portal access, not to one account. Nothing is enabled until you tick it.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {data.available.map((m) => {
          const checked = selected.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={checked}
              onClick={() => toggle(m.key)}
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

      {error && <p className="mb-2 text-xs" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          style={{ background: COLORS.gold }}
        >
          {saving ? "Saving…" : "Save role permissions"}
        </button>
        {saved && <span className="text-xs" style={{ color: "#6FCF97" }}>Saved.</span>}
      </div>
    </div>
  );
}
