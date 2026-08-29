import React, { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Upload, X, Plus, Trash2, ChevronDown, Paperclip } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { submitEventEnquiry, uploadEventEnquiryPoster, fetchMyEventEnquiries, fetchCategoryOptions } from "../api";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../shared/categories";

const inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)",
  color: COLORS.cream,
  padding: "10px 14px",
  fontSize: 14,
  outline: "none",
};

const labelStyle = {
  marginBottom: 6,
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "rgba(245,235,221,0.5)",
};

const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: "#D4AF37" },
  reviewed: { bg: "rgba(111,207,151,0.12)", color: "#93c5fd" },
  approved: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

function makeEmptyTier() {
  return { key: Math.random().toString(36).slice(2), tier_name: "", price: "", quantity: "" };
}

export default function EventEnquiryPage({ onBack }) {
  const [CATEGORIES, setCategories] = useState(FALLBACK_CATEGORIES);

  useEffect(() => {
    fetchCategoryOptions().then((cats) => {
      if (cats.length > 0) setCategories(cats);
    }).catch(() => {});
  }, []);
  const { profile } = useApp();

  const [form, setForm] = useState({
    org_name: "",
    org_about: "",
    contact_person: profile.name || "",
    contact_email: profile.email || "",
    contact_phone: profile.phone || "",
    event_title: "",
    event_category: "",
    event_description: "",
    proposed_date: "",
    proposed_time: "",
    venue: "",
    remarks: "",
  });
  const [tiers, setTiers] = useState([makeEmptyTier()]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = () => {
    setHistoryLoading(true);
    fetchMyEventEnquiries()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const updateTier = (key, field, value) =>
    setTiers((list) => list.map((t) => (t.key === key ? { ...t, [field]: value } : t)));

  const addTier = () => setTiers((list) => [...list, makeEmptyTier()]);
  const removeTier = (key) => setTiers((list) => (list.length > 1 ? list.filter((t) => t.key !== key) : list));

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const [posterFile, setPosterFile] = useState(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState(null);
  const handlePosterChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosterFile(file);
    setPosterPreviewUrl(URL.createObjectURL(file));
  };

  const [uploadingPosterForId, setUploadingPosterForId] = useState(null);
  const handleHistoryPosterChange = async (enquiryId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPosterForId(enquiryId);
    try {
      await uploadEventEnquiryPoster(enquiryId, file);
      loadHistory();
    } catch (err) {
      setError(err.message || "Couldn't upload poster. Please try again.");
    } finally {
      setUploadingPosterForId(null);
    }
  };

  const [copiedLinkForId, setCopiedLinkForId] = useState(null);
  const handleCopyPublicLink = async (enquiryId) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/event/${enquiryId}`);
      setCopiedLinkForId(enquiryId);
      setTimeout(() => setCopiedLinkForId(null), 2500);
    } catch (err) {
      // clipboard API unavailable — nothing more we can do here
    }
  };

  const tiersValid = tiers.every((t) => t.tier_name.trim() && Number(t.price) > 0 && Number(t.quantity) > 0);

  const requiredFilled =
    form.org_name.trim() && form.contact_person.trim() && form.contact_email.trim() &&
    form.contact_phone.trim() && form.event_title.trim() && form.event_category.trim() &&
    form.proposed_date.trim() && form.venue.trim() && tiersValid;

  const handleSubmit = async () => {
    if (!requiredFilled) return;
    setError("");
    setSubmitting(true);
    try {
      const tierPayload = tiers.map((t) => ({
        tier_name: t.tier_name.trim(),
        price: Number(t.price),
        quantity: Number(t.quantity),
      }));
      const result = await submitEventEnquiry(form, tierPayload, files);
      if (posterFile) {
        try {
          await uploadEventEnquiryPoster(result.id, posterFile);
        } catch (posterErr) {
          // Enquiry itself was submitted successfully — a poster
          // upload failure shouldn't block that acknowledgement.
          // They can add/retry the poster later from their enquiry history.
        }
      }
      setAcknowledged(result);
      loadHistory();
    } catch (err) {
      setError(err.message || "Couldn't submit your enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  if (acknowledged) {
    return (
      <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
        <main className="mx-auto max-w-xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
          <button
            type="button"
            onClick={onBack}
            className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
            style={{ color: COLORS.gold }}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="rounded-2xl p-8 text-center" style={{ background: COLORS.blackSoft, border: "1px solid rgba(111,207,151,0.35)" }}>
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10" style={{ color: "#6FCF97" }} />
            <h1 className="mb-2 text-xl font-semibold" style={{ color: COLORS.cream }}>Enquiry received</h1>
            <p className="mb-1 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              Thanks — your enquiry for <b>{acknowledged.event_title}</b> on behalf of <b>{acknowledged.org_name}</b> has been submitted.
            </p>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              A confirmation email has been sent to {acknowledged.contact_email}. It won't appear publicly until the Super Admin reviews and approves it.
            </p>
            <button
              type="button"
              onClick={() => setAcknowledged(null)}
              className="mt-6 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Submit another enquiry
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Event Listing Enquiry</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Submit a request for a theatre event to be considered for listing after Admin approval.
        </p>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: COLORS.gold }}>Organisation and Contact Details</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label style={labelStyle}>Theatre / Production House / Organiser Name *</label>
                <input type="text" value={form.org_name} onChange={update("org_name")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>About Them</label>
                <textarea rows={3} value={form.org_about} onChange={update("org_about")} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label style={labelStyle}>Contact Person *</label>
                  <input type="text" value={form.contact_person} onChange={update("contact_person")} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Phone *</label>
                  <input type="tel" value={form.contact_phone} onChange={update("contact_phone")} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Contact Email *</label>
                <input type="email" value={form.contact_email} onChange={update("contact_email")} style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: COLORS.gold }}>Event Information</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label style={labelStyle}>Event Title *</label>
                <input type="text" value={form.event_title} onChange={update("event_title")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Event Poster (3:4)</label>
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 overflow-hidden rounded-lg"
                    style={{ width: 90, aspectRatio: "3/4", background: "rgba(245,235,221,0.05)", border: "1px solid rgba(245,235,221,0.15)" }}
                  >
                    {posterPreviewUrl && (
                      <img src={posterPreviewUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div>
                    <label
                      className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                      style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
                    >
                      {posterFile ? "Change poster" : "Upload poster"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePosterChange} />
                    </label>
                    <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                      Portrait, 3:4 ratio recommended (e.g. 900×1200px) — shown once approved.
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Category *</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCategoryOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm"
                    style={{
                      borderColor: "rgba(245,235,221,0.15)",
                      background: "rgba(245,235,221,0.05)",
                      color: form.event_category ? COLORS.cream : "rgba(245,235,221,0.4)",
                    }}
                  >
                    {form.event_category || "Select a category"}
                    <ChevronDown className={`h-4 w-4 transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
                  </button>
                  {categoryOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCategoryOpen(false)} />
                      <div
                        className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl"
                        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.25)` }}
                      >
                        {CATEGORIES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setForm((f) => ({ ...f, event_category: c })); setCategoryOpen(false); }}
                            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-white/10"
                            style={{ color: form.event_category === c ? COLORS.gold : "rgba(245,235,221,0.85)" }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea rows={3} value={form.event_description} onChange={update("event_description")} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label style={labelStyle}>Proposed Date *</label>
                  <input type="date" value={form.proposed_date} onChange={update("proposed_date")} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Proposed Time</label>
                  <input type="text" placeholder="e.g. 7:00 PM" value={form.proposed_time} onChange={update("proposed_time")} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Venue *</label>
                <input type="text" value={form.venue} onChange={update("venue")} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Ticket Categories *</label>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 px-1 text-xs font-medium" style={{ color: "rgba(245,235,221,0.4)" }}>
                    <span>Category</span><span>Price (₹)</span><span>Qty</span><span></span>
                  </div>
                  {tiers.map((t) => (
                    <div key={t.key} className="grid grid-cols-[1fr_100px_100px_32px] items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Normal, Executive, Premium"
                        value={t.tier_name}
                        onChange={(e) => updateTier(t.key, "tier_name", e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="250"
                        value={t.price}
                        onChange={(e) => updateTier(t.key, "price", e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="40"
                        value={t.quantity}
                        onChange={(e) => updateTier(t.key, "quantity", e.target.value)}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => removeTier(t.key)}
                        disabled={tiers.length === 1}
                        className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30"
                        style={{ color: "#f87171" }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addTier}
                  className="mt-2 flex items-center gap-1 text-xs font-medium hover:opacity-80"
                  style={{ color: COLORS.gold }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add ticket category
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: COLORS.gold }}>Supporting Documents</h2>
            <label
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm"
              style={{ borderColor: "rgba(212,175,55,0.3)", color: "rgba(245,235,221,0.6)" }}
            >
              <Upload className="h-4 w-4" /> Upload event posters or supporting documents (JPG, PNG, PDF — up to 5 files, 10MB each)
              <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
            </label>
            {files.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(245,235,221,0.05)" }}>
                    <span style={{ color: "rgba(245,235,221,0.7)" }}>{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)}>
                      <X className="h-3.5 w-3.5" style={{ color: "rgba(245,235,221,0.5)" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <label style={labelStyle}>Additional Remarks</label>
              <textarea rows={3} value={form.remarks} onChange={update("remarks")} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>{error}</div>
          )}

          <button
            type="button"
            disabled={!requiredFilled || submitting}
            onClick={handleSubmit}
            className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            {submitting ? "Submitting…" : "Submit enquiry"}
          </button>
        </div>

        <div className="mt-10">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: "rgba(245,235,221,0.7)" }}>Your past enquiries</h3>
          {historyLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No enquiries submitted yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((h) => {
                const style = STATUS_STYLES[h.status] || STATUS_STYLES.pending;
                return (
                  <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{h.event_title}</p>
                        <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                          {h.event_category} · {h.org_name} · {h.venue} · Submitted {formatDate(h.created_at)}
                          {h.admin_note && ` · ${h.admin_note}`}
                        </p>
                      </div>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: style.bg, color: style.color }}>
                        {h.status}
                      </span>
                    </div>
                    {h.ticket_tiers.length > 0 && (
                      <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                        {h.ticket_tiers.map((t) => `${t.tier_name} ₹${t.price} × ${t.quantity}`).join(" · ")}
                      </p>
                    )}
                    {h.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {h.attachments.map((a) => (
                          <a
                            key={a.id}
                            href={a.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs hover:opacity-80"
                            style={{ background: "rgba(212,175,55,0.1)", color: COLORS.gold, border: "1px solid rgba(212,175,55,0.25)" }}
                          >
                            <Paperclip className="h-3 w-3" /> {a.original_filename}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {h.poster_image_url && (
                        <img src={h.poster_image_url} alt="" className="h-16 w-12 rounded object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} />
                      )}
                      <label
                        className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                        style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
                      >
                        {uploadingPosterForId === h.id ? "Uploading…" : h.poster_image_url ? "Change poster" : "Upload poster"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={uploadingPosterForId === h.id}
                          onChange={(e) => handleHistoryPosterChange(h.id, e)}
                        />
                      </label>
                      {h.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => handleCopyPublicLink(h.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-80"
                          style={{ background: "rgba(212,175,55,0.1)", color: COLORS.gold, border: "1px solid rgba(212,175,55,0.25)" }}
                        >
                          {copiedLinkForId === h.id ? "Link copied!" : "Copy public link"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
