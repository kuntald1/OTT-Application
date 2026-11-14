import React, { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { fetchAdminRewardConfig, updateAdminRewardConfig } from "./adminApi";

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

// One row per kind of purchase that can award points. The keys match
// reward_config's columns and app/rewards.py's PERCENT_FIELD_BY_KIND —
// adding a kind means adding it in all three places.
const EARN_ROWS = [
  { key: "subscription_reward_percent", label: "Subscription", hint: "When someone buys or renews a plan at checkout." },
  { key: "autopay_reward_percent", label: "Subscription auto-renew", hint: "When Razorpay charges an auto-renew plan on its own." },
  { key: "video_reward_percent", label: "Pay Per Video", hint: "A single video bought outside a plan." },
  { key: "live_stream_reward_percent", label: "Pay Per Live Streaming", hint: "A single live show bought outside a plan." },
  { key: "ticket_reward_percent", label: "Ticket booking", hint: "Seats for a show people attend in person. Starts at 0 — set a rate to start awarding points on bookings." },
];

export default function AdminRewardSettingsPage() {
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAdminRewardConfig()
      .then((c) => {
        const values = {
          subscription_reward_percent: String(c.subscription_reward_percent),
          autopay_reward_percent: String(c.autopay_reward_percent),
          video_reward_percent: String(c.video_reward_percent),
          live_stream_reward_percent: String(c.live_stream_reward_percent),
          ticket_reward_percent: String(c.ticket_reward_percent),
          point_value_rupees: String(c.point_value_rupees),
        };
        setForm(values);
        setInitial(values);
      })
      .catch((err) => setError(err.message || "Couldn't load reward settings."))
      .finally(() => setLoading(false));
  }, []);

  const set = (key, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const pointValue = Number(form?.point_value_rupees);
  const pointValueValid = Number.isFinite(pointValue) && pointValue > 0;
  // Changing what a point is worth silently re-prices every balance
  // already sitting in people's accounts, so it needs saying out loud
  // before the Save, not after.
  const pointValueChanged = initial && form && form.point_value_rupees !== initial.point_value_rupees;

  const handleSave = async () => {
    if (saving || !pointValueValid) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateAdminRewardConfig({
        subscription_reward_percent: Number(form.subscription_reward_percent) || 0,
        autopay_reward_percent: Number(form.autopay_reward_percent) || 0,
        video_reward_percent: Number(form.video_reward_percent) || 0,
        live_stream_reward_percent: Number(form.live_stream_reward_percent) || 0,
        ticket_reward_percent: Number(form.ticket_reward_percent) || 0,
        point_value_rupees: pointValue,
      });
      const values = {
        subscription_reward_percent: String(updated.subscription_reward_percent),
        autopay_reward_percent: String(updated.autopay_reward_percent),
        video_reward_percent: String(updated.video_reward_percent),
        live_stream_reward_percent: String(updated.live_stream_reward_percent),
        ticket_reward_percent: String(updated.ticket_reward_percent),
        point_value_rupees: String(updated.point_value_rupees),
      };
      setForm(values);
      setInitial(values);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err.message || "Couldn't save reward settings.");
    } finally {
      setSaving(false);
    }
  };

  // "100 points = ₹25" reads better than "0.25", and it is the sentence
  // a customer would actually be told.
  const pointsPerRupee = pointValueValid ? 1 / pointValue : null;
  const pointValueSentence = !pointValueValid
    ? "Enter a value greater than 0."
    : pointValue === 1
      ? "1 reward point = ₹1"
      : pointValue > 1
        ? `1 reward point = ₹${pointValue}`
        : `${Math.round(pointsPerRupee)} reward points = ₹1 (1 point = ₹${pointValue})`;

  if (loading) return <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>;
  if (!form) return <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>;

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Gift className="h-6 w-6" style={{ color: COLORS.gold }} /> Reward Points
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        How many points each kind of purchase earns, and what a point is worth. Changes apply to the
        next payment — points already earned are not recalculated.
      </p>

      {/* ---------------------------------------------------- Point value */}
      <div className="mb-6 max-w-md rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <label style={labelStyle}>What one reward point is worth (₹)</label>
        <input
          type="number" min="0.0001" step="0.0001"
          value={form.point_value_rupees}
          onChange={(e) => set("point_value_rupees", e.target.value)}
          style={inputStyle}
        />
        <p className="mt-1.5 text-[11px]" style={{ color: pointValueValid ? COLORS.gold : "#f87171" }}>
          {pointValueSentence}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
          Used both ways: it decides how many points a payment earns, and how much a point takes off at
          checkout. Examples — 1 = 1 point is ₹1, 0.1 = 10 points are ₹1, 0.25 = 1 point is 25 paise.
        </p>
        {pointValueChanged && (
          <p className="mt-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
            This changes what every balance already in customers' accounts is worth. A customer holding
            338 points has ₹338 to spend at 1, and ₹33.80 at 0.1. The point counts themselves stay as
            they are.
          </p>
        )}
      </div>

      {/* --------------------------------------------------- Earn rates */}
      <div className="max-w-2xl rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <p className="mb-1 text-sm font-semibold" style={{ color: COLORS.cream }}>Earn rate per purchase</p>
        <p className="mb-4 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
          A percentage of what the customer actually paid, handed back as points. 0 means that kind of
          purchase earns nothing.
        </p>

        <div className="flex flex-col gap-4">
          {EARN_ROWS.map((row) => {
            const percent = Number(form[row.key]);
            const valid = Number.isFinite(percent) && percent >= 0 && percent <= 100;
            // Worked example on ₹100, so the number means something.
            const pointsOn100 = valid && pointValueValid ? Math.round((100 * percent) / 100 / pointValue) : null;
            return (
              <div key={row.key} className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: COLORS.cream }}>{row.label}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>{row.hint}</p>
                </div>
                <div style={{ width: 150 }}>
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={form[row.key]}
                    onChange={(e) => set(row.key, e.target.value)}
                    style={inputStyle}
                  />
                  <p className="mt-1 text-[11px]" style={{ color: valid ? "rgba(245,235,221,0.4)" : "#f87171" }}>
                    {valid
                      ? (percent === 0 ? "No points" : `₹100 paid → ${pointsOn100} points`)
                      : "0 to 100 only"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
        {saved && <p className="mt-4 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}

        <button
          type="button" onClick={handleSave} disabled={saving || !pointValueValid}
          className="mt-4 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="mt-4 max-w-2xl text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
        Points can be redeemed at subscription checkout only. Pay Per Video, Pay Per Live Streaming and
        ticket bookings earn points but can't spend them yet.
      </p>
    </div>
  );
}
