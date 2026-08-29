import React, { useState } from "react";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { editEnquiry, uploadAdminEventEnquiryPoster } from "./adminApi";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37" };
const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function AdminEnquiryEditForm({ enquiry, onSave, onCancel, onFileUpdated }) {
  const [form, setForm] = useState({
    org_name: enquiry.org_name, org_about: enquiry.org_about || "",
    contact_person: enquiry.contact_person, contact_email: enquiry.contact_email, contact_phone: enquiry.contact_phone,
    event_title: enquiry.event_title, event_category: enquiry.event_category, event_description: enquiry.event_description || "",
    proposed_date: enquiry.proposed_date ? enquiry.proposed_date.slice(0, 10) : "", proposed_time: enquiry.proposed_time || "",
    venue: enquiry.venue, remarks: enquiry.remarks || "",
  });
  const [tiers, setTiers] = useState(
    enquiry.ticket_tiers.map((t) => ({ key: t.id, tier_name: t.tier_name, price: String(t.price), quantity: String(t.quantity) }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const handlePosterSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPoster(true);
    setError("");
    try {
      const updated = await uploadAdminEventEnquiryPoster(enquiry.id, file);
      onFileUpdated?.(updated);
    } catch (err) {
      setError(err.message || "Couldn't upload poster.");
    } finally {
      setUploadingPoster(false);
    }
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateTier = (key, field, value) => setTiers((list) => list.map((t) => (t.key === key ? { ...t, [field]: value } : t)));
  const addTier = () => setTiers((list) => [...list, { key: Math.random().toString(36).slice(2), tier_name: "", price: "", quantity: "" }]);
  const removeTier = (key) => setTiers((list) => (list.length > 1 ? list.filter((t) => t.key !== key) : list));

  const tiersValid = tiers.every((t) => t.tier_name.trim() && Number(t.price) > 0 && Number(t.quantity) > 0);
  const canSubmit = form.org_name.trim() && form.contact_person.trim() && form.contact_email.trim() && form.contact_phone.trim()
    && form.event_title.trim() && form.event_category.trim() && form.proposed_date && form.venue.trim() && tiersValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        org_name: form.org_name.trim(), org_about: form.org_about.trim() || null,
        contact_person: form.contact_person.trim(), contact_email: form.contact_email.trim(), contact_phone: form.contact_phone.trim(),
        event_title: form.event_title.trim(), event_category: form.event_category, event_description: form.event_description.trim() || null,
        proposed_date: new Date(form.proposed_date).toISOString(), proposed_time: form.proposed_time.trim() || null,
        venue: form.venue.trim(), remarks: form.remarks.trim() || null,
        ticket_tiers: tiers.map((t) => ({ tier_name: t.tier_name.trim(), price: Number(t.price), quantity: Number(t.quantity) })),
      };
      const updated = await editEnquiry(enquiry.id, payload);
      onSave(updated);
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(212,175,55,0.2)" }}>
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 overflow-hidden rounded-lg"
          style={{ width: 60, aspectRatio: "3/4", background: "rgba(245,235,221,0.05)", border: "1px solid rgba(245,235,221,0.15)" }}
        >
          {enquiry.poster_image_url && (
            <img src={enquiry.poster_image_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <label
          className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
          style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {uploadingPoster ? "Uploading…" : enquiry.poster_image_url ? "Change poster (3:4)" : "Upload poster (3:4)"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPoster} onChange={handlePosterSelect} />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div><label style={labelStyle}>Organisation Name</label><input type="text" value={form.org_name} onChange={update("org_name")} style={inputStyle} /></div>
        <div><label style={labelStyle}>Event Title</label><input type="text" value={form.event_title} onChange={update("event_title")} style={inputStyle} /></div>
      </div>
      <div><label style={labelStyle}>About Organisation</label><textarea rows={2} value={form.org_about} onChange={update("org_about")} style={{ ...inputStyle, resize: "vertical" }} /></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label style={labelStyle}>Contact Person</label><input type="text" value={form.contact_person} onChange={update("contact_person")} style={inputStyle} /></div>
        <div><label style={labelStyle}>Contact Email</label><input type="email" value={form.contact_email} onChange={update("contact_email")} style={inputStyle} /></div>
        <div><label style={labelStyle}>Contact Phone</label><input type="text" value={form.contact_phone} onChange={update("contact_phone")} style={inputStyle} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label style={labelStyle}>Category</label><input type="text" value={form.event_category} onChange={update("event_category")} style={inputStyle} /></div>
        <div><label style={labelStyle}>Venue</label><input type="text" value={form.venue} onChange={update("venue")} style={inputStyle} /></div>
      </div>
      <div><label style={labelStyle}>Event Description</label><textarea rows={2} value={form.event_description} onChange={update("event_description")} style={{ ...inputStyle, resize: "vertical" }} /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label style={labelStyle}>Proposed Date</label><input type="date" value={form.proposed_date} onChange={update("proposed_date")} style={inputStyle} /></div>
        <div><label style={labelStyle}>Proposed Time</label><input type="text" placeholder="e.g. 7:00 PM" value={form.proposed_time} onChange={update("proposed_time")} style={inputStyle} /></div>
      </div>
      <div><label style={labelStyle}>Remarks</label><textarea rows={2} value={form.remarks} onChange={update("remarks")} style={{ ...inputStyle, resize: "vertical" }} /></div>

      <div>
        <label style={labelStyle}>Ticket Categories</label>
        <div className="flex flex-col gap-1.5">
          {tiers.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-1.5">
              <input type="text" placeholder="Category" value={t.tier_name} onChange={(e) => updateTier(t.key, "tier_name", e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Price" value={t.price} onChange={(e) => updateTier(t.key, "price", e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Qty" value={t.quantity} onChange={(e) => updateTier(t.key, "quantity", e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => removeTier(t.key)} disabled={tiers.length === 1} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTier} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add ticket category</button>
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
