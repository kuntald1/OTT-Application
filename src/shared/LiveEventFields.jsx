import React from "react";

// ---------------------------------------------------------------------------
// LiveEventFields — the scheduling + monetization half of a live event
// form, shared by Admin > Live Streaming and the organiser's My Live
// Events page so the two can't drift apart. Title/description stay with
// each page (they differ in placement); everything below them lives here.
//
// `section` says WHERE the event is listed (Play / Archive / Both);
// `monetization_type` says HOW it's paid for.
//
// They're separate dropdowns rather than one combined list because a
// SUBSCRIPTION event genuinely needs both answers. A Pay Per Streaming
// event doesn't: whoever pays gets in, no plan involved, so there's no
// plan-shaped section to pick. For those the section is forced to
// "both" (listed everywhere, sold to everyone) and the control is
// locked — enforced again server-side, never trusted from here.
// ---------------------------------------------------------------------------

const INPUT_CLASS = "w-full rounded-lg border px-3 py-2 text-sm outline-none";
const INPUT_STYLE = {
  borderColor: "rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)",
  color: "#f5ebdd",
};
const LABEL_CLASS = "mb-1 block text-[11px] font-semibold uppercase tracking-wide";
const LABEL_STYLE = { color: "rgba(245,235,221,0.5)" };

// <input type="datetime-local"> speaks "YYYY-MM-DDTHH:mm" in the
// BROWSER's timezone, while the API speaks UTC ISO. These two convert
// between them, so an organiser in Kolkata types 5:00 PM and viewers
// everywhere see the right local time.
export function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function emptyLiveEventForm() {
  return {
    section: "play",
    monetization_type: "subscription",
    price_inr: "",
    price_usd: "",
    scheduled_start_at: "", // local "YYYY-MM-DDTHH:mm"
    promo_from: "",         // "YYYY-MM-DD"
  };
}

// Prefills the form from a list row (LiveStreamBroadcastInfoOut).
export function liveEventFormFrom(stream) {
  return {
    section: stream.section || "play",
    monetization_type: stream.monetization_type || "subscription",
    price_inr: stream.price_inr != null ? String(stream.price_inr) : "",
    price_usd: stream.price_usd != null ? String(stream.price_usd) : "",
    scheduled_start_at: toLocalInputValue(stream.scheduled_start_at),
    promo_from: stream.promo_from || "",
  };
}

// The API body for these fields. Prices are only sent for a ticketed
// event — the server clears them otherwise anyway, but sending them
// would make the intent ambiguous.
export function liveEventPayload(form) {
  const isPaid = form.monetization_type === "pay_per_stream";
  return {
    // A paid show is sold to everyone, so it's listed everywhere —
    // see the note at the top of this file. The server forces the
    // same thing, this just keeps the request honest.
    section: isPaid ? "both" : form.section,
    monetization_type: form.monetization_type,
    price_inr: isPaid && form.price_inr !== "" ? Number(form.price_inr) : null,
    price_usd: isPaid && form.price_usd !== "" ? Number(form.price_usd) : null,
    scheduled_start_at: fromLocalInputValue(form.scheduled_start_at),
    promo_from: form.promo_from || null,
  };
}

// Mirrors the server's own rule (routers/live_streams.py
// _validate_monetization) so the Create button can say why it's
// disabled instead of failing on submit.
export function liveEventFormError(form) {
  if (form.monetization_type !== "pay_per_stream") return null;
  const inr = Number(form.price_inr);
  const usd = Number(form.price_usd);
  if (form.price_inr === "" || form.price_usd === "") {
    return "A Pay Per Streaming event needs both a \u20b9 and a $ show price.";
  }
  if (!(inr > 0) || !(usd > 0)) return "Show price must be greater than zero.";
  return null;
}

export default function LiveEventFields({ values, onChange, dropdownBg = "#150307" }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });
  const isPaid = values.monetization_type === "pay_per_stream";
  const optionStyle = { background: dropdownBg };

  // Switching to Pay Per Streaming pins the section to "both" in the
  // same keystroke, so what's on screen always matches what will be
  // saved — no silent correction on submit.
  const setMonetization = (e) => {
    const monetization_type = e.target.value;
    onChange({
      ...values,
      monetization_type,
      section: monetization_type === "pay_per_stream" ? "both" : values.section,
    });
  };

  return (
    <div className="mb-3 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} style={LABEL_STYLE}>Shows on</label>
          <select
            value={isPaid ? "both" : values.section}
            onChange={set("section")}
            disabled={isPaid}
            className={INPUT_CLASS}
            style={{ ...INPUT_STYLE, ...(isPaid ? { opacity: 0.55, cursor: "not-allowed" } : null) }}
          >
            <option value="play" style={optionStyle}>Play</option>
            <option value="archive" style={optionStyle}>Archive</option>
            <option value="both" style={optionStyle}>Both</option>
          </select>
          {isPaid && (
            <p className="mt-1 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
              A paid show isn't tied to a plan, so it's listed in both sections.
            </p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS} style={LABEL_STYLE}>Access</label>
          <select
            value={values.monetization_type}
            onChange={setMonetization}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          >
            <option value="subscription" style={optionStyle}>Subscription</option>
            <option value="pay_per_stream" style={optionStyle}>Pay Per Streaming</option>
          </select>
        </div>
      </div>

      {isPaid && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS} style={LABEL_STYLE}>Show price (₹)</label>
            <input
              type="number" min="0" step="1" inputMode="decimal"
              value={values.price_inr} onChange={set("price_inr")}
              placeholder="199"
              className={INPUT_CLASS} style={INPUT_STYLE}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} style={LABEL_STYLE}>Show price ($)</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={values.price_usd} onChange={set("price_usd")}
              placeholder="4.99"
              className={INPUT_CLASS} style={INPUT_STYLE}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} style={LABEL_STYLE}>Show date &amp; time</label>
          <input
            type="datetime-local"
            value={values.scheduled_start_at}
            onChange={set("scheduled_start_at")}
            className={INPUT_CLASS} style={INPUT_STYLE}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} style={LABEL_STYLE}>Promote from</label>
          <input
            type="date"
            value={values.promo_from}
            onChange={set("promo_from")}
            className={INPUT_CLASS} style={INPUT_STYLE}
          />
        </div>
      </div>

      <p className="text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
        Leave both dates empty to keep the old behaviour — the event appears only once it's actually broadcasting.
        Set them to announce it in advance: it's listed from the promote date, showing the show time, but stays
        unplayable until the broadcast really starts.
      </p>
    </div>
  );
}
