import React, { useEffect, useState } from "react";
import { Compass, Eye, EyeOff } from "lucide-react";
import { fetchAdminDiscoverySettings, setAdminDiscoveryRowVisibility, hideAdminDiscoveryItem, unhideAdminDiscoveryItem } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const ROW_LABELS = { languages: "Popular Languages", studios: "Studios" };

function RowCard({ rowKey, row, onToggleRow, onToggleItem, busyKey }) {
  return (
    <div className="mb-6 rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: COLORS.cream }}>{ROW_LABELS[rowKey]}</h2>
        <button
          type="button"
          onClick={() => onToggleRow(rowKey, !row.is_visible)}
          disabled={busyKey === `row:${rowKey}`}
          className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={row.is_visible ? { background: "rgba(111,207,151,0.15)", color: "#6FCF97" } : { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" }}
        >
          {row.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {row.is_visible ? "Row visible" : "Row hidden"}
        </button>
      </div>

      {!row.is_visible && (
        <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>
          The whole row is off — it won't show on Plays or Archive regardless of individual items below.
        </p>
      )}

      {row.all_items.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No items yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {row.all_items.map((item) => {
            const isBusy = busyKey === `item:${rowKey}:${item.key}`;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onToggleItem(rowKey, item.key, !item.hidden)}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={item.hidden ? { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.4)", textDecoration: "line-through" } : { background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
              >
                {item.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDiscoverySettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminDiscoverySettings()
      .then(setSettings)
      .catch((err) => setError(err.message || "Couldn't load settings."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleToggleRow = async (rowKey, nextVisible) => {
    setBusyKey(`row:${rowKey}`);
    setError("");
    try {
      await setAdminDiscoveryRowVisibility(rowKey, nextVisible);
      setSettings((s) => ({ ...s, [rowKey]: { ...s[rowKey], is_visible: nextVisible } }));
    } catch (err) {
      setError(err.message || "Couldn't update.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleItem = async (rowKey, itemKey, nextHidden) => {
    setBusyKey(`item:${rowKey}:${itemKey}`);
    setError("");
    try {
      if (nextHidden) await hideAdminDiscoveryItem(rowKey, itemKey);
      else await unhideAdminDiscoveryItem(rowKey, itemKey);
      setSettings((s) => ({
        ...s,
        [rowKey]: {
          ...s[rowKey],
          all_items: s[rowKey].all_items.map((it) => (it.key === itemKey ? { ...it, hidden: nextHidden } : it)),
        },
      }));
    } catch (err) {
      setError(err.message || "Couldn't update.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Compass className="h-6 w-6" style={{ color: COLORS.gold }} /> Discovery Row Settings
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Show or hide the "Popular Languages" and "Studios" rows on Plays and Archive — the whole row, or just individual items.
      </p>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="max-w-2xl">
          <RowCard rowKey="languages" row={settings.languages} onToggleRow={handleToggleRow} onToggleItem={handleToggleItem} busyKey={busyKey} />
          <RowCard rowKey="studios" row={settings.studios} onToggleRow={handleToggleRow} onToggleItem={handleToggleItem} busyKey={busyKey} />
        </div>
      )}
    </div>
  );
}
