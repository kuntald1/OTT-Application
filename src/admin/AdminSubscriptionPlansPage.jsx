import React, { useEffect, useState } from "react";
import { CreditCard, Plus, Pencil, Eye, EyeOff } from "lucide-react";
import {
  fetchAdminSubscriptionPlans, createAdminSubscriptionPlan, updateAdminSubscriptionPlan, toggleAdminSubscriptionPlan,
  fetchAdminSubscriptionDurations, createAdminSubscriptionDuration, updateAdminSubscriptionDuration, toggleAdminSubscriptionDuration,
  fetchAdminTaxConfig, updateAdminTaxConfig,
} from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
  colorScheme: "dark",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function AdminSubscriptionPlansPage() {
  const [tab, setTab] = useState("plans");

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <CreditCard className="h-6 w-6" style={{ color: COLORS.gold }} /> Subscription Plan Management
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Create, edit, activate and deactivate subscription plans, including duration, pricing, taxes, benefits and content access.
      </p>

      <div className="mb-6 flex gap-2">
        {[
          { id: "plans", label: "Plans" },
          { id: "durations", label: "Durations" },
          { id: "tax", label: "Tax" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={tab === t.id ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plans" && <PlansTab />}
      {tab === "durations" && <DurationsTab />}
      {tab === "tax" && <TaxTab />}
    </div>
  );
}

// --------------------------------------------------------------------- Plans

const EMPTY_PLAN_FORM = {
  name: "", tagline: "", base_price: "", per_extra_screen: "0", base_price_usd: "0", per_extra_screen_usd: "0",
  features: "", grants_play: false, grants_archive: false, highlighted: false, display_order: "0",
};

function planFormToPayload(form) {
  return {
    name: form.name.trim(),
    tagline: form.tagline.trim() || null,
    base_price: Number(form.base_price) || 0,
    per_extra_screen: Number(form.per_extra_screen) || 0,
    base_price_usd: Number(form.base_price_usd) || 0,
    per_extra_screen_usd: Number(form.per_extra_screen_usd) || 0,
    features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
    grants_play: form.grants_play,
    grants_archive: form.grants_archive,
    highlighted: form.highlighted,
    display_order: Number(form.display_order) || 0,
  };
}

function planToForm(p) {
  return {
    name: p.name, tagline: p.tagline || "", base_price: String(p.base_price), per_extra_screen: String(p.per_extra_screen),
    base_price_usd: String(p.base_price_usd), per_extra_screen_usd: String(p.per_extra_screen_usd),
    features: (p.features || []).join("\n"), grants_play: p.grants_play, grants_archive: p.grants_archive,
    highlighted: p.highlighted, display_order: String(p.display_order),
  };
}

function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_PLAN_FORM);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_PLAN_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdminSubscriptionPlans()
      .then(setPlans)
      .catch((err) => setError(err.message || "Couldn't load plans."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.base_price) return;
    setCreating(true);
    setError("");
    try {
      await createAdminSubscriptionPlan(planFormToPayload(createForm));
      setShowCreateForm(false);
      setCreateForm(EMPTY_PLAN_FORM);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create plan.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (p) => { setEditingId(p.id); setEditForm(planToForm(p)); };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editForm.base_price) return;
    setSaving(true);
    setError("");
    try {
      await updateAdminSubscriptionPlan(editingId, planFormToPayload(editForm));
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await toggleAdminSubscriptionPlan(id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't update plan.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {!showCreateForm ? (
        <button
          type="button"
          onClick={() => { setShowCreateForm(true); setCreateForm(EMPTY_PLAN_FORM); }}
          className="mb-4 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-3.5 w-3.5" /> New Plan
        </button>
      ) : (
        <div className="mb-6 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <PlanFormFields form={createForm} setForm={setCreateForm} />
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={handleCreate} disabled={creating || !createForm.name.trim() || !createForm.base_price}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              {editingId === p.id ? (
                <div>
                  <PlanFormFields form={editForm} setForm={setEditForm} />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button" onClick={handleSaveEdit} disabled={saving || !editForm.name.trim() || !editForm.base_price}
                      className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
                      {p.name}
                      {p.highlighted && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}>Best Value</span>
                      )}
                      {!p.is_active && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>Disabled</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      ₹{p.base_price}/mo (${p.base_price_usd}) · +₹{p.per_extra_screen}/screen ·{" "}
                      {[p.grants_play && "Play", p.grants_archive && "Archive"].filter(Boolean).join(" + ") || "No content access set"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => startEdit(p)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button" onClick={() => handleToggle(p.id)} disabled={busyId === p.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      {p.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {p.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {plans.length === 0 && <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No plans yet.</p>}
        </div>
      )}
    </div>
  );
}

function PlanFormFields({ form, setForm }) {
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setBool = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.checked }));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label style={labelStyle}>Name *</label>
        <input type="text" value={form.name} onChange={set("name")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Tagline</label>
        <input type="text" placeholder="e.g. Unlimited Video Streaming" value={form.tagline} onChange={set("tagline")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Base Price (₹/month) *</label>
        <input type="number" min="0" value={form.base_price} onChange={set("base_price")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Per Extra Screen (₹/month)</label>
        <input type="number" min="0" value={form.per_extra_screen} onChange={set("per_extra_screen")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Base Price ($/month)</label>
        <input type="number" min="0" value={form.base_price_usd} onChange={set("base_price_usd")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Per Extra Screen ($/month)</label>
        <input type="number" min="0" value={form.per_extra_screen_usd} onChange={set("per_extra_screen_usd")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Display Order</label>
        <input type="number" value={form.display_order} onChange={set("display_order")} style={inputStyle} />
      </div>
      <div className="flex items-end gap-4 pb-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>
          <input type="checkbox" checked={form.highlighted} onChange={setBool("highlighted")} /> Best Value badge
        </label>
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Content Access</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>
            <input type="checkbox" checked={form.grants_play} onChange={setBool("grants_play")} /> Play
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>
            <input type="checkbox" checked={form.grants_archive} onChange={setBool("grants_archive")} /> Archive
          </label>
        </div>
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Features (one per line)</label>
        <textarea rows={3} value={form.features} onChange={set("features")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Durations

const EMPTY_DURATION_FORM = { label: "", months: "1", discount_percent: "0", display_order: "0" };

function durationFormToPayload(form) {
  return {
    label: form.label.trim(),
    months: Number(form.months) || 1,
    discount_percent: Number(form.discount_percent) || 0,
    display_order: Number(form.display_order) || 0,
  };
}

function durationToForm(d) {
  return { label: d.label, months: String(d.months), discount_percent: String(d.discount_percent), display_order: String(d.display_order) };
}

function DurationsTab() {
  const [durations, setDurations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_DURATION_FORM);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_DURATION_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdminSubscriptionDurations()
      .then(setDurations)
      .catch((err) => setError(err.message || "Couldn't load durations."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!createForm.label.trim() || !createForm.months) return;
    setCreating(true);
    setError("");
    try {
      await createAdminSubscriptionDuration(durationFormToPayload(createForm));
      setShowCreateForm(false);
      setCreateForm(EMPTY_DURATION_FORM);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create duration.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (d) => { setEditingId(d.id); setEditForm(durationToForm(d)); };

  const handleSaveEdit = async () => {
    if (!editForm.label.trim() || !editForm.months) return;
    setSaving(true);
    setError("");
    try {
      await updateAdminSubscriptionDuration(editingId, durationFormToPayload(editForm));
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await toggleAdminSubscriptionDuration(id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't update duration.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {!showCreateForm ? (
        <button
          type="button" onClick={() => { setShowCreateForm(true); setCreateForm(EMPTY_DURATION_FORM); }}
          className="mb-4 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-3.5 w-3.5" /> New Duration
        </button>
      ) : (
        <div className="mb-6 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <DurationFormFields form={createForm} setForm={setCreateForm} />
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={handleCreate} disabled={creating || !createForm.label.trim()}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {durations.map((d) => (
            <div key={d.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              {editingId === d.id ? (
                <div>
                  <DurationFormFields form={editForm} setForm={setEditForm} />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button" onClick={handleSaveEdit} disabled={saving || !editForm.label.trim()}
                      className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
                      {d.label}
                      {!d.is_active && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>Disabled</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                      {d.months} month{d.months === 1 ? "" : "s"} {Number(d.discount_percent) > 0 && `· −${d.discount_percent}%`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => startEdit(d)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button" onClick={() => handleToggle(d.id)} disabled={busyId === d.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      {d.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {d.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {durations.length === 0 && <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No durations yet.</p>}
        </div>
      )}
    </div>
  );
}

function DurationFormFields({ form, setForm }) {
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label style={labelStyle}>Label *</label>
        <input type="text" placeholder="e.g. 6 Months" value={form.label} onChange={set("label")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Months *</label>
        <input type="number" min="1" max="60" value={form.months} onChange={set("months")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Discount %</label>
        <input type="number" min="0" max="100" value={form.discount_percent} onChange={set("discount_percent")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Display Order</label>
        <input type="number" value={form.display_order} onChange={set("display_order")} style={inputStyle} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- Tax

function TaxTab() {
  const [gstPercent, setGstPercent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAdminTaxConfig()
      .then((c) => setGstPercent(String(c.gst_percent)))
      .catch((err) => setError(err.message || "Couldn't load tax config."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateAdminTaxConfig(Number(gstPercent) || 0);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Couldn't save tax config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>;

  return (
    <div className="max-w-sm rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
      <label style={labelStyle}>GST Percent</label>
      <input type="number" min="0" max="100" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} style={inputStyle} />
      <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
        Applied on top of every India (Razorpay) checkout. Doesn't apply outside India.
      </p>
      {error && <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
      {saved && <p className="mt-2 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}
      <button
        type="button" onClick={handleSave} disabled={saving}
        className="mt-3 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: COLORS.gold, color: "#0a0104" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
