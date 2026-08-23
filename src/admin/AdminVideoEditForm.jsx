import React, { useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { editVideo } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const CATEGORIES = [
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];
const AGE_RATINGS = ["U", "UA7+", "UA13+", "UA16+", "A"];

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

function Dropdown({ label, value, options, onChange, capitalizeOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div className="relative">
        <button
          type="button" onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${capitalizeOptions ? "capitalize" : ""}`}
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        >
          {value}
          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className={`absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg ${capitalizeOptions ? "capitalize" : ""}`} style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}>
              {options.map((opt) => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10" style={{ color: value === opt ? COLORS.gold : "rgba(245,235,221,0.85)" }}>
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function tierRowsFromVideo(video) {
  return video.revenue_tiers.length > 0
    ? video.revenue_tiers.map((t) => ({ key: t.id, min_minutes: String(t.min_minutes), max_minutes: t.max_minutes === null ? "" : String(t.max_minutes), rate_per_minute_inr: String(t.rate_per_minute_inr) }))
    : [{ key: "new", min_minutes: "", max_minutes: "", rate_per_minute_inr: "" }];
}
function castRowsFromVideo(video) {
  return video.cast.map((c) => ({ key: c.id, name: c.person.name, character_role: c.character_role || "" }));
}
function crewRowsFromVideo(video) {
  return video.crew.map((c) => ({ key: c.id, role: c.role, name: c.person.name }));
}

export default function AdminVideoEditForm({ video, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: video.title, description: video.description || "", section: video.section,
    categories: video.categories, release_year: String(video.release_year), age_rating: video.age_rating,
    languages: video.languages.join(", "), has_ads: video.has_ads, monetization_type: video.monetization_type,
    price_inr: video.pricing ? String(video.pricing.price_inr) : "", price_usd: video.pricing ? String(video.pricing.price_usd) : "",
  });
  const [tiers, setTiers] = useState(tierRowsFromVideo(video));
  const [cast, setCast] = useState(castRowsFromVideo(video));
  const [crew, setCrew] = useState(crewRowsFromVideo(video));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const toggleCategory = (cat) => setForm((f) => {
    const has = f.categories.includes(cat);
    if (has) return { ...f, categories: f.categories.filter((c) => c !== cat) };
    if (f.categories.length >= 3) return f;
    return { ...f, categories: [...f.categories, cat] };
  });

  const updateTier = (key, field, value) => setTiers((list) => list.map((t) => (t.key === key ? { ...t, [field]: value } : t)));
  const addTier = () => tiers.length < 5 && setTiers((list) => [...list, { key: Math.random().toString(36).slice(2), min_minutes: "", max_minutes: "", rate_per_minute_inr: "" }]);
  const removeTier = (key) => setTiers((list) => (list.length > 1 ? list.filter((t) => t.key !== key) : list));

  const updateCast = (key, field, value) => setCast((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  const addCast = () => cast.length < 10 && setCast((list) => [...list, { key: Math.random().toString(36).slice(2), name: "", character_role: "" }]);
  const removeCast = (key) => setCast((list) => list.filter((c) => c.key !== key));

  const updateCrew = (key, field, value) => setCrew((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  const addCrew = () => crew.length < 5 && setCrew((list) => [...list, { key: Math.random().toString(36).slice(2), role: "", name: "" }]);
  const removeCrew = (key) => setCrew((list) => list.filter((c) => c.key !== key));

  const isPayPerVideo = form.monetization_type === "pay_per_video";
  const tiersValid = tiers.every((t) => t.min_minutes !== "" && Number(t.rate_per_minute_inr) > 0);
  const pricingValid = !isPayPerVideo || (Number(form.price_inr) > 0 && Number(form.price_usd) > 0);
  const canSubmit = form.title.trim() && form.categories.length > 0 && form.release_year && form.age_rating && tiersValid && pricingValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description.trim() || null, section: form.section,
        categories: form.categories, release_year: Number(form.release_year), age_rating: form.age_rating,
        languages: form.languages.trim() ? form.languages.split(",").map((l) => l.trim()).filter(Boolean) : null,
        has_ads: form.has_ads, monetization_type: form.monetization_type,
        price_inr: isPayPerVideo ? Number(form.price_inr) : null, price_usd: isPayPerVideo ? Number(form.price_usd) : null,
        revenue_tiers: tiers.map((t) => ({ min_minutes: Number(t.min_minutes), max_minutes: t.max_minutes === "" ? null : Number(t.max_minutes), rate_per_minute_inr: Number(t.rate_per_minute_inr) })),
        cast: cast.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), character_role: c.character_role.trim() || null })),
        crew: crew.filter((c) => c.role.trim() && c.name.trim()).map((c) => ({ role: c.role.trim(), name: c.name.trim() })),
      };
      const updated = await editVideo(video.id, payload);
      onSave(updated);
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(212,175,55,0.2)" }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Title</label>
          <input type="text" value={form.title} onChange={update("title")} style={inputStyle} />
        </div>
        <Dropdown label="Section" value={form.section} options={["play", "archive"]} onChange={(v) => setForm((f) => ({ ...f, section: v }))} capitalizeOptions />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea rows={2} value={form.description} onChange={update("description")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Release Year</label>
          <input type="number" value={form.release_year} onChange={update("release_year")} style={inputStyle} />
        </div>
        <Dropdown label="Age Rating" value={form.age_rating} options={AGE_RATINGS} onChange={(v) => setForm((f) => ({ ...f, age_rating: v }))} />
      </div>
      <div>
        <label style={labelStyle}>Categories (up to 3)</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const selected = form.categories.includes(cat);
            return (
              <button key={cat} type="button" onClick={() => toggleCategory(cat)} disabled={!selected && form.categories.length >= 3}
                className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-30"
                style={{ borderColor: selected ? COLORS.gold : "rgba(245,235,221,0.15)", background: selected ? "rgba(212,175,55,0.14)" : "transparent", color: selected ? COLORS.gold : "rgba(245,235,221,0.7)" }}>
                {cat}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Languages</label>
          <input type="text" placeholder="e.g. Bengali, English" value={form.languages} onChange={update("languages")} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Ads</label>
          <button type="button" onClick={() => setForm((f) => ({ ...f, has_ads: !f.has_ads }))} className="w-full rounded-lg border px-3 py-2 text-left text-sm" style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}>
            {form.has_ads ? "Ad Present" : "Ad Free"}
          </button>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Monetization</label>
        <div className="flex gap-2">
          {[["subscription_only", "Subscription Only"], ["pay_per_video", "Pay Per Video"]].map(([val, lbl]) => (
            <button key={val} type="button" onClick={() => setForm((f) => ({ ...f, monetization_type: val }))} className="rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.15)", background: form.monetization_type === val ? "rgba(212,175,55,0.14)" : "transparent", color: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.7)" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {isPayPerVideo && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label style={labelStyle}>Price (₹)</label><input type="number" value={form.price_inr} onChange={update("price_inr")} style={inputStyle} /></div>
          <div><label style={labelStyle}>Price ($)</label><input type="number" value={form.price_usd} onChange={update("price_usd")} style={inputStyle} /></div>
        </div>
      )}
      <div>
        <label style={labelStyle}>Revenue-Share Tiers</label>
        <div className="flex flex-col gap-1.5">
          {tiers.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-1.5">
              <input type="number" placeholder="Min" value={t.min_minutes} onChange={(e) => updateTier(t.key, "min_minutes", e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Max" value={t.max_minutes} onChange={(e) => updateTier(t.key, "max_minutes", e.target.value)} style={inputStyle} />
              <input type="number" step="0.01" placeholder="Rate" value={t.rate_per_minute_inr} onChange={(e) => updateTier(t.key, "rate_per_minute_inr", e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => removeTier(t.key)} disabled={tiers.length === 1} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {tiers.length < 5 && <button type="button" onClick={addTier} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add tier</button>}
      </div>
      <div>
        <label style={labelStyle}>Cast</label>
        <div className="flex flex-col gap-1.5">
          {cast.map((c) => (
            <div key={c.key} className="grid grid-cols-[1fr_1fr_28px] items-center gap-1.5">
              <input type="text" placeholder="Name" value={c.name} onChange={(e) => updateCast(c.key, "name", e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Character" value={c.character_role} onChange={(e) => updateCast(c.key, "character_role", e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => removeCast(c.key)} className="flex h-8 w-8 items-center justify-center" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {cast.length < 10 && <button type="button" onClick={addCast} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add cast</button>}
      </div>
      <div>
        <label style={labelStyle}>Crew</label>
        <div className="flex flex-col gap-1.5">
          {crew.map((c) => (
            <div key={c.key} className="grid grid-cols-[1fr_1fr_28px] items-center gap-1.5">
              <input type="text" placeholder="Role" value={c.role} onChange={(e) => updateCrew(c.key, "role", e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Name" value={c.name} onChange={(e) => updateCrew(c.key, "name", e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => removeCrew(c.key)} className="flex h-8 w-8 items-center justify-center" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {crew.length < 5 && <button type="button" onClick={addCrew} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add crew</button>}
      </div>

      {error && <p className="text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex items-center gap-2">
        <button type="button" disabled={!canSubmit || submitting} onClick={handleSubmit} className="rounded-full px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40" style={{ background: COLORS.gold }}>
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
      </div>
    </div>
  );
}
