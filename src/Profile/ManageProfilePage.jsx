import React, { useState } from "react";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Manage Profile — reached from the profile menu. Edits photo, name, email,
// and phone — all saved to the real backend via AppContext's
// changePhoto()/updateProfile(). Photo is uploaded and stored on the
// server, so it persists across refresh, logout, and other devices.
// ---------------------------------------------------------------------------

export default function ManageProfilePage({ onBack }) {
  const { profile, changePhoto, updateProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (file) => {
    if (!file) return;
    setPhotoError("");
    setUploadingPhoto(true);
    try {
      await changePhoto(file);
    } catch (err) {
      setPhotoError(err.message || "Couldn't upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

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
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Manage Profile</h1>

        <div className="mb-8" />
        <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-2 flex items-center gap-4">
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-semibold"
              style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.cream }}
            >
              {profile.photo ? (
                <img src={profile.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile.name || "?")[0]?.toUpperCase()
              )}
            </div>
            <label
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium"
              style={{
                border: `1px solid ${COLORS.gold}`,
                color: COLORS.gold,
                opacity: uploadingPhoto ? 0.5 : 1,
                pointerEvents: uploadingPhoto ? "none" : "auto",
              }}
            >
              {uploadingPhoto ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPhoto}
                onChange={(e) => handlePhotoChange(e.target.files?.[0])}
              />
            </label>
          </div>
          {photoError && (
            <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{photoError}</p>
          )}

          <div className="mb-4 mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="cursor-not-allowed"
              style={{ ...inputStyle, opacity: 0.6 }}
            />
          </div>
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Phone (optional)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Add a phone number" style={inputStyle} />
          </div>

          {error && (
            <p className="mb-4 text-sm font-medium" style={{ color: "#f87171" }}>{error}</p>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!name.trim() || !email.trim() || saving}
              onClick={handleSave}
              className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: "#6FCF97" }}>
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
