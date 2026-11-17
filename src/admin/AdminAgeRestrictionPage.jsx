import React, { useEffect, useState } from "react";
import { ShieldAlert, AlertTriangle, Check } from "lucide-react";
import {
  fetchAdminAgeRestriction,
  fetchAdminAgeRestrictionImpact,
  updateAdminAgeRestriction,
} from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

// What each certificate means, in the words a person would use. The
// list of ratings itself comes from the server (all_ratings), so adding
// one there shows up here without a frontend change — only the
// description below would need a line.
const RATING_NOTES = {
  "U": "Suitable for everyone.",
  "UA7+": "Parental guidance for children under 7.",
  "UA13+": "Parental guidance for children under 13.",
  "UA16+": "Parental guidance for children under 16.",
  "A": "Adults only. 18+.",
};

const ratingLabel = (r) => (r === "A" ? "A (18+)" : r);

export default function AdminAgeRestrictionPage({ isSuperadmin }) {
  const [config, setConfig] = useState(null);
  const [impact, setImpact] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [restricted, setRestricted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const apply = (res) => {
    setConfig(res);
    setEnabled(res.enabled);
    setRestricted(res.restricted_ratings || []);
  };

  useEffect(() => {
    Promise.all([fetchAdminAgeRestriction(), fetchAdminAgeRestrictionImpact().catch(() => null)])
      .then(([res, imp]) => { apply(res); setImpact(imp); })
      .catch((err) => setError(err.message || "Couldn't load the age restriction settings."))
      .finally(() => setLoading(false));
  }, []);

  const toggleRating = (rating) => {
    setSaved(false);
    setRestricted((prev) =>
      prev.includes(rating) ? prev.filter((r) => r !== rating) : [...prev, rating]
    );
  };

  const onSave = async () => {
    setError(""); setSaved(false); setSaving(true);
    try {
      const res = await updateAdminAgeRestriction({ enabled, restricted_ratings: restricted });
      apply(res);
      setSaved(true);
      fetchAdminAgeRestrictionImpact().then(setImpact).catch(() => {});
    } catch (err) {
      setError(err.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const allRatings = config?.all_ratings || ["U", "UA7+", "UA13+", "UA16+", "A"];
  const counts = impact?.published_by_rating || {};
  const hiddenCount = restricted.reduce((sum, r) => sum + (counts[r] || 0), 0);
  const dirty =
    config &&
    (enabled !== config.enabled ||
      restricted.slice().sort().join(",") !== (config.restricted_ratings || []).slice().sort().join(","));

  if (loading) {
    return <p className="p-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold" style={{ color: COLORS.cream }}>
        <ShieldAlert className="h-5 w-5" style={{ color: COLORS.gold }} /> Age Restriction
      </h1>
      <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
        Which certificates are closed to under-18 profiles. A restricted video doesn't
        appear anywhere for them — not in browse, search, recommendations or a shared
        link — and it won't play or be purchasable.
      </p>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Who this applies to — the question every admin asks first. */}
      <div className="mb-5 rounded-xl p-4 text-sm" style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)", color: "rgba(245,235,221,0.75)" }}>
        <p className="mb-1.5 font-semibold" style={{ color: COLORS.cream }}>Who this applies to</p>
        <p className="mb-1">
          Main accounts are already 18 or over — date of birth is taken at
          registration and under-18s are refused, so nothing here affects them.
        </p>
        <p>
          It applies to family accounts a parent created and marked as being for
          someone under 18, and to visitors who aren't logged in. A parent can change
          that marking from their own Manage Profile page.
        </p>
      </div>

      <div className="rounded-2xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Master switch */}
        <label className="flex cursor-pointer items-start gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }}
            disabled={!isSuperadmin}
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            style={{ accentColor: COLORS.gold }}
          />
          <span>
            <span className="block text-sm font-semibold" style={{ color: COLORS.cream }}>
              Age restriction is on
            </span>
            <span className="block text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
              Turn this off and everyone sees everything again, exactly as before. The
              certificates below stay saved, so turning it back on restores them.
            </span>
          </span>
        </label>

        <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
          Hidden from under-18 profiles
        </p>

        <div className="flex flex-col gap-2" style={{ opacity: enabled ? 1 : 0.45 }}>
          {allRatings.map((rating) => {
            const count = counts[rating];
            return (
              <label
                key={rating}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: "rgba(245,235,221,0.03)" }}
              >
                <input
                  type="checkbox"
                  checked={restricted.includes(rating)}
                  onChange={() => toggleRating(rating)}
                  disabled={!isSuperadmin || !enabled}
                  className="h-4 w-4 flex-shrink-0"
                  style={{ accentColor: COLORS.gold }}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                    {ratingLabel(rating)}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
                    {RATING_NOTES[rating] || ""}
                  </span>
                </span>
                {typeof count === "number" && (
                  <span className="flex-shrink-0 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                    {count} video{count === 1 ? "" : "s"}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {/* What this change actually does, before it is saved. */}
        {enabled && impact && (
          <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(245,235,221,0.04)", color: "rgba(245,235,221,0.7)" }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: COLORS.gold }} />
            <span>
              {hiddenCount === 0
                ? "No published video carries any of the ticked certificates, so nothing is hidden yet."
                : `${hiddenCount} published video${hiddenCount === 1 ? "" : "s"} will be hidden from under-18 profiles and from logged-out visitors.`}
            </span>
          </div>
        )}

        {isSuperadmin ? (
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && !dirty && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6FCF97" }}>
                <Check className="h-3.5 w-3.5" /> Saved. It takes effect straight away.
              </span>
            )}
          </div>
        ) : (
          <p className="mt-5 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            Only a superadmin can change these.
          </p>
        )}
      </div>
    </div>
  );
}
