import React, { useState } from "react";
import { X } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { submitOrganiserRequest } from "../api";

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "10px 12px", fontSize: 14, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function OrganiserRequestModal({ profile, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    subject: "", group_name: profile?.name || "", phone: profile?.phone || "", email: profile?.email || "", remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.group_name.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await submitOrganiserRequest({
        subject: form.subject.trim(), group_name: form.group_name.trim(),
        phone: form.phone.trim(), email: form.email.trim(), remarks: form.remarks.trim() || null,
      });
      onSubmitted?.();
    } catch (err) {
      setError(err.message || "Couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: COLORS.cream }}>Request as Organiser</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/5" style={{ color: "rgba(245,235,221,0.6)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Subject *</label>
            <input type="text" value={form.subject} onChange={set("subject")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Group Name *</label>
            <input type="text" value={form.group_name} onChange={set("group_name")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone Number *</label>
            <input type="text" value={form.phone} onChange={set("phone")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              value={form.email}
              readOnly
              disabled
              style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}
            />
          </div>
          <div>
            <label style={labelStyle}>Remarks</label>
            <textarea rows={3} value={form.remarks} onChange={set("remarks")} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 w-full rounded-full py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </div>
    </div>
  );
}
